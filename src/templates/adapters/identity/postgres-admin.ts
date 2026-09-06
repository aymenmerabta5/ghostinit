// @allow-long 502: the atomic admin mutation renderer keeps authorization, locking, writes, audit, and integration guidance together
import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import * as v from "../../versions.js";

function postgresAdminCompositionContent(mode: ProjectMode): string {
  const authImport = mode === "monorepo" ? "@repo/auth" : "@/server/auth";
  const databaseImport =
    mode === "monorepo"
      ? `import { accounts, adminAuditEvents, db, sessions, users } from "@repo/database";`
      : `import { db } from "@/server/db";
import { accounts, adminAuditEvents, sessions, users } from "@/server/db/schema/auth";`;
  const loggerImport = mode === "monorepo" ? "@repo/observability" : "@/server/observability";
  const serviceImport = mode === "monorepo" ? "../../admin/index" : "@/server/services/admin";
  const serviceImportLine = `import * as admin from "${serviceImport}";`;

  return `// @allow-long 429: authoritative Postgres admin mutations with serialized policy and transactional audit
import "server-only";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { auth } from "${authImport}";
${databaseImport}
import { logger } from "${loggerImport}";
${serviceImportLine}

type UserRow = typeof users.$inferSelect;
type AdminDatabase = Pick<typeof db, "insert" | "select" | "update">;

const MAX_ADMIN_TRANSACTION_ATTEMPTS = 3;
const RETRYABLE_ADMIN_POSTGRES_CODES = new Set(["40001", "40P01"]);

function postgresErrorCode(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 3) return null;
  const code = Reflect.get(error, "code");
  if (typeof code === "string") return code;
  return postgresErrorCode(Reflect.get(error, "cause"), depth + 1);
}

async function runSerializableAdminTransaction<T>(
  work: (transaction: AdminDatabase) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ADMIN_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction(async (transaction) => await work(transaction), {
        isolationLevel: "serializable",
      });
    } catch (error) {
      const code = postgresErrorCode(error);
      if (
        !code ||
        !RETRYABLE_ADMIN_POSTGRES_CODES.has(code) ||
        attempt === MAX_ADMIN_TRANSACTION_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
  throw new Error("Serializable admin transaction exhausted its retry budget");
}

function isStoredAdminRole(role: string | null): boolean {
  return role === "admin" || role === "superAdmin";
}

function toAdminRole(role: string | null): admin.AdminUserRole {
  return isStoredAdminRole(role) ? "admin" : "user";
}

function isEffectivelyBanned(row: UserRow, observedAt: Date): boolean {
  return (
    row.banned === true && (!row.banExpires || row.banExpires.getTime() > observedAt.getTime())
  );
}

function activeAdminPredicate(observedAt: Date) {
  return and(
    inArray(users.role, ["admin", "superAdmin"]),
    or(eq(users.banned, false), isNull(users.banned), lte(users.banExpires, observedAt)),
  );
}

async function lockActiveAdmins(database: AdminDatabase, observedAt: Date): Promise<UserRow[]> {
  return await database
    .select()
    .from(users)
    .where(activeAdminPredicate(observedAt))
    .orderBy(asc(users.id))
    .for("update");
}

function requireActiveAdminActor(row: UserRow | undefined, observedAt: Date): UserRow {
  if (!row || !isStoredAdminRole(row.role)) {
    throw new admin.AdminServiceError("ADMIN_FORBIDDEN", "Administrator access is required");
  }
  if (isEffectivelyBanned(row, observedAt)) {
    throw new admin.AdminServiceError(
      "ADMIN_ACTOR_BANNED",
      "Suspended accounts cannot administer users",
    );
  }
  return row;
}

async function lockAdminActor(
  database: AdminDatabase,
  actorId: string,
  observedAt: Date,
): Promise<UserRow> {
  const rows = await database
    .select()
    .from(users)
    .where(eq(users.id, actorId))
    .for("update");
  return requireActiveAdminActor(rows[0], observedAt);
}

async function lockActorAndTarget(
  database: AdminDatabase,
  actorId: string,
  targetId: string,
  observedAt: Date,
): Promise<{ actor: UserRow; target: UserRow }> {
  const ids = actorId === targetId ? [actorId] : [actorId, targetId].sort();
  const rows = await database
    .select()
    .from(users)
    .where(inArray(users.id, ids))
    .orderBy(asc(users.id))
    .for("update");
  const actor = requireActiveAdminActor(
    rows.find((row) => row.id === actorId),
    observedAt,
  );
  const target = rows.find((row) => row.id === targetId);
  if (!target) throw new admin.AdminServiceError("ADMIN_USER_NOT_FOUND", "User not found");
  return { actor, target };
}

function sameStoredRole(row: UserRow) {
  return row.role === null ? isNull(users.role) : eq(users.role, row.role);
}

function sameStoredBan(row: UserRow) {
  return row.banned === null ? isNull(users.banned) : eq(users.banned, row.banned);
}

async function persistAdminAudit(
  database: AdminDatabase,
  event: admin.AdminAuditEvent,
): Promise<void> {
  await database.insert(adminAuditEvents).values({
    action: event.action,
    actorId: event.actorId,
    targetId: event.targetId,
    metadata: { ...event.metadata },
    createdAt: event.occurredAt,
  });
}

function logCommittedAdminAudit(event: admin.AdminAuditEvent): void {
  logger.info("Admin audit event", {
    action: event.action,
    actorId: event.actorId,
    targetId: event.targetId,
    occurredAt: event.occurredAt.toISOString(),
    ...event.metadata,
  });
}

function requireGeneratedIdentityId(value: string | false, model: "user" | "account"): string {
  if (value !== false) return value;
  throw new admin.AdminServiceError(
    "ADMIN_CREATE_FAILED",
    "Better Auth must generate an id for the " + model + " model",
  );
}

async function createAdminUserAtomically(
  actor: admin.AdminActor,
  input: admin.CreateAdminUserInput,
  occurredAt: Date,
): Promise<admin.AdminUser> {
  const authContext = await auth.$context;
  if (
    input.password.length < authContext.password.config.minPasswordLength ||
    input.password.length > authContext.password.config.maxPasswordLength
  ) {
    throw new admin.AdminServiceError(
      "ADMIN_VALIDATION_ERROR",
      "Password does not satisfy the configured identity policy",
    );
  }
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const at = email.indexOf("@");
  const hasPlausibleEmailShape =
    at > 0 &&
    at === email.lastIndexOf("@") &&
    email.slice(at + 1).includes(".") &&
    !email.includes(" ");
  if (!name || name.length > 80 || email.length > 255 || !hasPlausibleEmailShape) {
    throw new admin.AdminServiceError(
      "ADMIN_VALIDATION_ERROR",
      "Name or email is invalid",
    );
  }
  // Hash before opening the database transaction. The configured Better Auth
  // hash function is CPU intensive but has no persistent side effects.
  const password = await authContext.password.hash(input.password);
  const userId = requireGeneratedIdentityId(authContext.generateId({ model: "user" }), "user");
  const accountRowId = requireGeneratedIdentityId(
    authContext.generateId({ model: "account" }),
    "account",
  );

  let committed: { value: admin.AdminUser; audit: admin.AdminAuditEvent };
  try {
    committed = await runSerializableAdminTransaction(async (transaction) => {
      const authoritativeActor = await lockAdminActor(transaction, actor.id, occurredAt);
      const inserted = await transaction
        .insert(users)
        .values({
          id: userId,
          name,
          email,
          emailVerified: false,
          image: null,
          role: input.role,
          banned: false,
          banReason: null,
          banExpires: null,
          twoFactorEnabled: false,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        })
        .returning();
      const created = inserted[0];
      if (!created) {
        throw new admin.AdminServiceError("ADMIN_CREATE_FAILED", "Unable to create user");
      }
      await transaction.insert(accounts).values({
        id: accountRowId,
        accountId: userId,
        providerId: "credential",
        userId,
        password,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
      const value: admin.AdminUser = {
        id: created.id,
        name: created.name || null,
        email: created.email,
        role: toAdminRole(created.role),
        banned: isEffectivelyBanned(created, occurredAt),
      };
      const audit: admin.AdminAuditEvent = {
        action: "admin.user.created",
        actorId: authoritativeActor.id,
        targetId: created.id,
        metadata: { role: value.role },
        occurredAt,
      };
      // The user row, credential account, and mandatory audit either all
      // commit or all roll back under one serializable transaction.
      await persistAdminAudit(transaction, audit);
      return { value, audit };
    });
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      throw new admin.AdminServiceError(
        "ADMIN_USER_EXISTS",
        "A user with this email already exists",
        { cause: error },
      );
    }
    throw error;
  }
  logCommittedAdminAudit(committed.audit);
  return committed.value;
}

async function changeAdminRoleAtomically(
  actor: admin.AdminActor,
  targetId: string,
  role: admin.AdminUserRole,
): Promise<{ id: string; role: admin.AdminUserRole }> {
  const occurredAt = new Date();
  const committed = await runSerializableAdminTransaction(async (transaction) => {
    const activeAdmins = await lockActiveAdmins(transaction, occurredAt);
    const principals = await lockActorAndTarget(transaction, actor.id, targetId, occurredAt);
    const currentRole = toAdminRole(principals.target.role);
    const value = { id: principals.target.id, role };
    if (currentRole === role) return { value, audit: null };
    if (principals.actor.id === principals.target.id && role !== "admin") {
      throw new admin.AdminServiceError(
        "ADMIN_SELF_ACTION",
        "You cannot remove your own administrator role",
      );
    }
    const targetIsActiveAdmin = activeAdmins.some(
      (candidate) => candidate.id === principals.target.id,
    );
    if (targetIsActiveAdmin && role !== "admin" && activeAdmins.length <= 1) {
      throw new admin.AdminServiceError(
        "ADMIN_LAST_ADMIN",
        "The final administrator cannot be demoted",
      );
    }
    const updated = await transaction
      .update(users)
      .set({ role, updatedAt: occurredAt })
      .where(and(eq(users.id, principals.target.id), sameStoredRole(principals.target)))
      .returning();
    if (!updated[0]) {
      throw new admin.AdminServiceError(
        "ADMIN_CONCURRENT_MODIFICATION",
        "The user role changed concurrently",
      );
    }
    const audit: admin.AdminAuditEvent = {
      action: "admin.user.role_changed",
      actorId: principals.actor.id,
      targetId: principals.target.id,
      metadata: { previousRole: currentRole, role },
      occurredAt,
    };
    await persistAdminAudit(transaction, audit);
    return { value, audit };
  });
  if (committed.audit) logCommittedAdminAudit(committed.audit);
  return committed.value;
}

async function setAdminBannedAtomically(
  actor: admin.AdminActor,
  targetId: string,
  banned: boolean,
  suppliedReason?: string,
): Promise<{ id: string; banned: boolean }> {
  const occurredAt = new Date();
  const committed = await runSerializableAdminTransaction(async (transaction) => {
    const activeAdmins = await lockActiveAdmins(transaction, occurredAt);
    const principals = await lockActorAndTarget(transaction, actor.id, targetId, occurredAt);
    const currentBanned = isEffectivelyBanned(principals.target, occurredAt);
    const value = { id: principals.target.id, banned };
    if (currentBanned === banned) return { value, audit: null };
    if (principals.actor.id === principals.target.id && banned) {
      throw new admin.AdminServiceError("ADMIN_SELF_ACTION", "You cannot suspend your own account");
    }
    const targetIsActiveAdmin = activeAdmins.some(
      (candidate) => candidate.id === principals.target.id,
    );
    if (banned && targetIsActiveAdmin && activeAdmins.length <= 1) {
      throw new admin.AdminServiceError(
        "ADMIN_LAST_ADMIN",
        "The final administrator cannot be suspended",
      );
    }
    const trimmedReason = suppliedReason?.trim();
    if (trimmedReason && trimmedReason.length > 500) {
      throw new admin.AdminServiceError(
        "ADMIN_VALIDATION_ERROR",
        "Suspension reason must be at most 500 characters",
      );
    }
    const reason = banned ? trimmedReason || "Suspended by administrator" : null;
    const updated = await transaction
      .update(users)
      .set({
        banned,
        banReason: reason,
        banExpires: null,
        updatedAt: occurredAt,
      })
      .where(and(eq(users.id, principals.target.id), sameStoredBan(principals.target)))
      .returning();
    if (!updated[0]) {
      throw new admin.AdminServiceError(
        "ADMIN_CONCURRENT_MODIFICATION",
        "The user suspension changed concurrently",
      );
    }
    if (banned) {
      await transaction
        .update(sessions)
        .set({ expiresAt: occurredAt, revokedAt: occurredAt, updatedAt: occurredAt })
        .where(
          and(
            eq(sessions.userId, principals.target.id),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, occurredAt),
          ),
        );
    }
    const audit: admin.AdminAuditEvent = {
      action: "admin.user.ban_changed",
      actorId: principals.actor.id,
      targetId: principals.target.id,
      metadata: { previousBanned: currentBanned, banned, reason },
      occurredAt,
    };
    await persistAdminAudit(transaction, audit);
    return { value, audit };
  });
  if (committed.audit) logCommittedAdminAudit(committed.audit);
  return committed.value;
}

function createStandaloneAuditPort(): admin.AdminAuditPort {
  return {
    async record(event) {
      await persistAdminAudit(db, event);
      logCommittedAdminAudit(event);
    },
  };
}

export function createAdminServiceForRequest(headers: Headers): admin.AdminService {
  const identity = admin.createBetterAuthAdminIdentityPort(auth, headers);
  const base = admin.createAdminService({
    identity,
    audit: createStandaloneAuditPort(),
    userCreation: {
      async createUserWithAudit(command: admin.CreateAdminUserCommand) {
        const { actor, input, occurredAt } = command;
        return await createAdminUserAtomically(actor, input, occurredAt);
      },
    },
  });
  return {
    ...base,
    changeRole: changeAdminRoleAtomically,
    setBanned: setAdminBannedAtomically,
  };
}
`;
}

export function postgresAdminAdapterFiles(mode: ProjectMode): TemplateFile[] {
  return [
    file(
      mode === "monorepo"
        ? "packages/services/src/application/composition/admin.ts"
        : "src/server/services/application/composition/admin.ts",
      postgresAdminCompositionContent(mode),
    ),
  ];
}

export interface PostgresAdminAdapterIntegrationGuide {
  emissionCondition: string;
  compositionPath: string;
  rendererImport: string;
  rendererCall: string;
  replacesPlaceholder: true;
  requiredPackageDependencies: Readonly<Record<string, string>>;
  instructions: readonly string[];
}

export function postgresAdminAdapterIntegrationGuide(
  mode: ProjectMode,
): PostgresAdminAdapterIntegrationGuide {
  const compositionPath =
    mode === "monorepo"
      ? "packages/services/src/application/composition/admin.ts"
      : "src/server/services/application/composition/admin.ts";
  return {
    emissionCondition: 'withAuth && database === "postgres"',
    compositionPath,
    rendererImport:
      'import { postgresAdminAdapterFiles } from "./adapters/identity/postgres-admin.js";',
    rendererCall: `files.push(...postgresAdminAdapterFiles("${mode}"));`,
    replacesPlaceholder: true,
    requiredPackageDependencies:
      mode === "monorepo"
        ? { "@repo/database": "workspace:*", "drizzle-orm": `^${v.database["drizzle-orm"]}` }
        : {},
    instructions: [
      `Replace the legacy admin composition at ${compositionPath}.`,
      "Use Better Auth only for read operations and its configured password hash/id generation; create the user, credential account, and audit in one Postgres transaction.",
      "Do not expose Better Auth admin role or suspension mutation endpoints as an alternate authority.",
      "Derive the actor id from verified request context, then reload actor and target inside the serializable transaction.",
      "Keep every mandatory database audit insert in the mutation transaction and emit observability logging only after commit.",
      "Verify request authentication against the live session row so a stale cookie cache cannot retain suspended access.",
      "Treat an expired temporary ban as inactive when deriving request actors and active-admin counts.",
      "Add ADMIN_LAST_ADMIN to the set-banned oRPC error map and map ADMIN_CONCURRENT_MODIFICATION on both mutation routes.",
    ],
  };
}
