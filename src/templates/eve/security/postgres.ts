// @allow-long 410: Postgres actor, durable ownership, and transactional admission adapters share one policy boundary
import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function postgresEveActorFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const authImport = mode === "monorepo" ? "@repo/auth/server" : "@/server/auth";
  const databaseImport = mode === "monorepo" ? "@repo/database" : "@/server/db";
  const schemaImport = mode === "monorepo" ? "@repo/database" : "@/server/db/schema/auth";
  return file(
    `${base}/actor.ts`,
    `import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { auth } from "${authImport}";
import { db } from "${databaseImport}";
import { members, sessions, teamMembers, teams, users } from "${schemaImport}";

export interface AuthenticatedEveActor {
  readonly authSessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly organizationId: string | null;
  readonly role: string;
  readonly teamId: string | null;
  readonly userId: string;
}

function activeBan(banned: boolean | null, banExpires: Date | null, now: Date): boolean {
  return banned === true && (banExpires === null || banExpires > now);
}

export async function resolveAuthenticatedEveActor(
  headers: Headers,
): Promise<AuthenticatedEveActor | null> {
  const verified = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!verified?.session?.id || !verified.user?.id) return null;

  const now = new Date();
  const rows = await db
    .select({
      authSessionId: sessions.id,
      userId: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      banned: users.banned,
      banExpires: users.banExpires,
      organizationId: sessions.activeOrganizationId,
      teamId: sessions.activeTeamId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, verified.session.id),
        eq(sessions.userId, verified.user.id),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  const actor = rows[0];
  if (!actor || activeBan(actor.banned, actor.banExpires, now)) return null;

  if (actor.organizationId !== null) {
    const membership = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.organizationId, actor.organizationId),
          eq(members.userId, actor.userId),
        ),
      )
      .limit(1);
    if (!membership[0]) return null;
  }

  if (actor.teamId !== null) {
    if (actor.organizationId === null) return null;
    const membership = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(
          eq(teamMembers.teamId, actor.teamId),
          eq(teamMembers.userId, actor.userId),
          eq(teams.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!membership[0]) return null;
  }

  return {
    authSessionId: actor.authSessionId,
    email: actor.email,
    emailVerified: actor.emailVerified === true && verified.user.emailVerified === true,
    organizationId: actor.organizationId,
    role: actor.role ?? "user",
    teamId: actor.teamId,
    userId: actor.userId,
  };
}
`,
  );
}

export function postgresEveOwnershipAdapterFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const databaseImport = mode === "monorepo" ? "@repo/database" : "@/server/db";
  const schemaImport = mode === "monorepo" ? "@repo/database" : "@/server/db/schema/eve";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  return file(
    `${base}/ownership-adapter.ts`,
    `import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "${databaseImport}";
import { eveAgentSessions } from "${schemaImport}";
import { members, sessions, teamMembers, teams, users } from "${
      mode === "monorepo" ? "@repo/database" : "@/server/db/schema/auth"
    }";
import {
  sameAgentSessionOwner,
  type AgentSessionActor,
  type AgentSessionOwnershipPort,
} from "${serviceImport}";

async function actorIsAuthoritative(actor: AgentSessionActor): Promise<boolean> {
  const now = new Date();
  const active = await db
    .select({
      banned: users.banned,
      banExpires: users.banExpires,
      organizationId: sessions.activeOrganizationId,
      teamId: sessions.activeTeamId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, actor.authSessionId),
        eq(sessions.userId, actor.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  const value = active[0];
  if (
    !value ||
    (value.banned === true && (value.banExpires === null || value.banExpires > now)) ||
    value.organizationId !== actor.organizationId ||
    value.teamId !== actor.teamId
  ) {
    return false;
  }
  if (actor.organizationId === null) return actor.teamId === null;
  const membership = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organizationId, actor.organizationId),
        eq(members.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!membership[0]) return false;
  if (actor.teamId === null) return true;
  const teamMembership = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(
      and(
        eq(teamMembers.teamId, actor.teamId),
        eq(teamMembers.userId, actor.userId),
        eq(teams.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  return teamMembership[0] !== undefined;
}

export const agentSessionOwnershipPort: AgentSessionOwnershipPort = {
  async claim(input) {
    if (!(await actorIsAuthoritative(input.actor))) return "conflict";
    const inserted = await db
      .insert(eveAgentSessions)
      .values({
        eveSessionId: input.eveSessionId,
        userId: input.actor.userId,
        organizationId: input.actor.organizationId,
        teamId: input.actor.teamId,
        createdByAuthSessionId: input.actor.authSessionId,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing({ target: eveAgentSessions.eveSessionId })
      .returning({ eveSessionId: eveAgentSessions.eveSessionId });
    if (inserted[0]) return "created";
    const existing = await db
      .select({
        userId: eveAgentSessions.userId,
        organizationId: eveAgentSessions.organizationId,
        teamId: eveAgentSessions.teamId,
        retiredAt: eveAgentSessions.retiredAt,
      })
      .from(eveAgentSessions)
      .where(eq(eveAgentSessions.eveSessionId, input.eveSessionId))
      .limit(1);
    const record = existing[0];
    return record && record.retiredAt === null && sameAgentSessionOwner(record, input.actor)
      ? "existing"
      : "conflict";
  },

  async authorize(input) {
    if (!(await actorIsAuthoritative(input.actor))) return false;
    const rows = await db
      .select({
        userId: eveAgentSessions.userId,
        organizationId: eveAgentSessions.organizationId,
        teamId: eveAgentSessions.teamId,
        retiredAt: eveAgentSessions.retiredAt,
      })
      .from(eveAgentSessions)
      .where(eq(eveAgentSessions.eveSessionId, input.eveSessionId))
      .limit(1);
    const record = rows[0];
    return record !== undefined && record.retiredAt === null && sameAgentSessionOwner(record, input.actor);
  },

  async retire(input) {
    if (!(await agentSessionOwnershipPort.authorize(input))) return false;
    const updated = await db
      .update(eveAgentSessions)
      .set({ retiredAt: input.retiredAt })
      .where(
        and(
          eq(eveAgentSessions.eveSessionId, input.eveSessionId),
          isNull(eveAgentSessions.retiredAt),
        ),
      )
      .returning({ eveSessionId: eveAgentSessions.eveSessionId });
    return updated[0] !== undefined;
  },
};
`,
  );
}

export function postgresEveAdmissionAdapterFile(
  mode: ProjectMode,
  hasBilling: boolean,
): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const databaseImport = mode === "monorepo" ? "@repo/database" : "@/server/db";
  const schemaImport = mode === "monorepo" ? "@repo/database" : "@/server/db/schema/eve";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  const billingImport = mode === "monorepo" ? "@repo/billing" : "@/server/db/schema/billing";
  const billingImportLine = hasBilling ? `import { subscriptions } from "${billingImport}";\n` : "";
  const drizzleImportLine = hasBilling
    ? 'import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";'
    : 'import { and, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";';
  const applicationPolicyLine = hasBilling
    ? ""
    : "// With no billing capability, the application sponsors verified users within the same durable admission limits.\nconst APPLICATION_SPONSORED_EVE_ACCESS = true;\n";
  const plan = hasBilling ? "pro" : "sponsored";
  const entitlementCheck = hasBilling
    ? `      const entitled = await transaction
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, input.actor.userId),
            sql\`\${subscriptions.metadata}->>'planId' = 'pro'\`,
            or(
              and(
                eq(subscriptions.status, "active"),
                or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, now)),
              ),
              and(
                inArray(subscriptions.status, ["trialing", "on_trial"]),
                or(isNull(subscriptions.trialEnd), gt(subscriptions.trialEnd, now)),
              ),
            ),
          ),
        )
        .limit(1);
      if (!entitled[0]) {
        return { ok: false as const, code: "EVE_ENTITLEMENT_REQUIRED" as const };
      }`
    : `      if (!APPLICATION_SPONSORED_EVE_ACCESS) {
        return { ok: false as const, code: "EVE_ENTITLEMENT_UNSUPPORTED" as const };
      }`;
  const admissionImports = `  EVE_ADMISSION_LEASE_MS,
  EVE_MAX_CONCURRENT_OPERATIONS,
  EVE_MAX_OPERATIONS_PER_WINDOW,
  EVE_OPERATION_RATE_WINDOW_MS,
  isTerminalEveRuntimeEvent,
  type AgentAdmissionPort,
  type AgentRuntimeAdmissionPort,`;
  const admit = `  async admit(input) {
    if (!input.actor.emailVerified) {
      return { ok: false as const, code: "EVE_ENTITLEMENT_REQUIRED" as const };
    }
    const now = input.requestedAt;
    if (!Number.isFinite(now.getTime())) throw new Error("Eve admission timestamp is invalid");
    const rateWindowMs = EVE_OPERATION_RATE_WINDOW_MS;
    const operationLimit = EVE_MAX_OPERATIONS_PER_WINDOW;
    const windowStartedAt = new Date(now.getTime() - rateWindowMs);
    const leaseExpiresAt = new Date(now.getTime() + EVE_ADMISSION_LEASE_MS);
    return await db.transaction(async (transaction) => {
      // Serialize admission for one user across every application process.
      await transaction.execute(
        sql\`select pg_advisory_xact_lock(hashtextextended(\${"eve:" + input.actor.userId}, 0))\`,
      );
${entitlementCheck}

      await transaction
        .delete(eveAgentAdmissions)
        .where(
          and(
            eq(eveAgentAdmissions.userId, input.actor.userId),
            lt(eveAgentAdmissions.expiresAt, windowStartedAt),
            isNull(eveAgentAdmissions.eveSessionId),
          ),
        );
      const recent = await transaction
        .select({ id: eveAgentAdmissions.id })
        .from(eveAgentAdmissions)
        .where(
          and(
            eq(eveAgentAdmissions.userId, input.actor.userId),
            gte(eveAgentAdmissions.createdAt, windowStartedAt),
          ),
        )
        .limit(operationLimit);
      if (recent.length >= operationLimit) {
        return {
          ok: false as const,
          code: "EVE_RATE_LIMITED" as const,
          retryAfterSeconds: Math.ceil(rateWindowMs / 1_000),
        };
      }
      const active = await transaction
        .select({ expiresAt: eveAgentAdmissions.expiresAt })
        .from(eveAgentAdmissions)
        .where(
          and(
            eq(eveAgentAdmissions.userId, input.actor.userId),
            isNull(eveAgentAdmissions.releasedAt),
            or(
              gt(eveAgentAdmissions.expiresAt, now),
              isNotNull(eveAgentAdmissions.eveSessionId),
            ),
          ),
        )
        .limit(EVE_MAX_CONCURRENT_OPERATIONS);
      if (active.length >= EVE_MAX_CONCURRENT_OPERATIONS) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(((active[0]?.expiresAt.getTime() ?? leaseExpiresAt.getTime()) - now.getTime()) / 1_000),
        );
        return { ok: false as const, code: "EVE_CONCURRENCY_LIMIT" as const, retryAfterSeconds };
      }
      const leaseId = randomUUID();
      await transaction.insert(eveAgentAdmissions).values({
        id: leaseId,
        userId: input.actor.userId,
        organizationId: input.actor.organizationId,
        teamId: input.actor.teamId,
        eveSessionId: input.eveSessionId,
        operation: input.operation,
        plan: ${JSON.stringify(plan)},
        createdAt: now,
        expiresAt: leaseExpiresAt,
      });
      return { ok: true as const, leaseId, plan: ${JSON.stringify(plan)} as const };
    });
  },`;
  return file(
    `${base}/admission-adapter.ts`,
    `import "server-only";
import { randomUUID } from "node:crypto";
${drizzleImportLine}
import { db } from "${databaseImport}";
import {
  eveAgentAdmissions,
  eveAgentRuntimeEvents,
  eveAgentRuntimeSessions,
} from "${schemaImport}";
${billingImportLine}import {
${admissionImports}
} from "${serviceImport}";

${applicationPolicyLine}
export const agentAdmissionPort = {
${admit}

  async bindSession(input) {
    const [bound] = await db
      .update(eveAgentAdmissions)
      .set({ eveSessionId: input.eveSessionId })
      .where(
        and(
          eq(eveAgentAdmissions.id, input.leaseId),
          eq(eveAgentAdmissions.userId, input.actor.userId),
          or(
            isNull(eveAgentAdmissions.eveSessionId),
            eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
          ),
        ),
      )
      .returning({ id: eveAgentAdmissions.id });
    if (!bound) throw new Error("Eve admission lease could not be bound to its session");
  },

  async listExpiredBoundSessions(input) {
    if (!Number.isFinite(input.inspectedAt.getTime())) {
      throw new Error("Eve admission inspection timestamp is invalid");
    }
    return await db
      .select({
        eveSessionId: eveAgentAdmissions.eveSessionId,
        leaseId: eveAgentAdmissions.id,
      })
      .from(eveAgentAdmissions)
      .where(
        and(
          eq(eveAgentAdmissions.userId, input.actor.userId),
          input.actor.organizationId === null
            ? isNull(eveAgentAdmissions.organizationId)
            : eq(eveAgentAdmissions.organizationId, input.actor.organizationId),
          input.actor.teamId === null
            ? isNull(eveAgentAdmissions.teamId)
            : eq(eveAgentAdmissions.teamId, input.actor.teamId),
          isNotNull(eveAgentAdmissions.eveSessionId),
          isNull(eveAgentAdmissions.releasedAt),
          lte(eveAgentAdmissions.expiresAt, input.inspectedAt),
        ),
      )
      .then((rows) =>
        rows.flatMap((row) =>
          row.eveSessionId === null
            ? []
            : [{ eveSessionId: row.eveSessionId, leaseId: row.leaseId }],
        ),
      );
  },

  async touchSession(input) {
    if (!Number.isFinite(input.touchedAt.getTime())) return;
    await db
      .update(eveAgentAdmissions)
      .set({ expiresAt: new Date(input.touchedAt.getTime() + EVE_ADMISSION_LEASE_MS) })
      .where(
        and(
          eq(eveAgentAdmissions.userId, input.actor.userId),
          input.actor.organizationId === null
            ? isNull(eveAgentAdmissions.organizationId)
            : eq(eveAgentAdmissions.organizationId, input.actor.organizationId),
          input.actor.teamId === null
            ? isNull(eveAgentAdmissions.teamId)
            : eq(eveAgentAdmissions.teamId, input.actor.teamId),
          eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
          isNull(eveAgentAdmissions.releasedAt),
        ),
      );
  },

  async release(input) {
    await db
      .update(eveAgentAdmissions)
      .set({ releasedAt: input.releasedAt })
      .where(
        and(
          eq(eveAgentAdmissions.id, input.leaseId),
          eq(eveAgentAdmissions.userId, input.actor.userId),
          isNull(eveAgentAdmissions.releasedAt),
        ),
      );
  },

  async releaseSession(input) {
    const released = await db
      .update(eveAgentAdmissions)
      .set({ releasedAt: input.releasedAt })
      .where(
        and(
          eq(eveAgentAdmissions.userId, input.actor.userId),
          eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
          isNull(eveAgentAdmissions.releasedAt),
          input.leaseId === undefined
            ? undefined
            : eq(eveAgentAdmissions.id, input.leaseId),
        ),
      )
      .returning({ id: eveAgentAdmissions.id });
    return released.length > 0;
  },

  async recordRuntimeEvent(input) {
    if (
      !Number.isFinite(input.eventAt.getTime()) ||
      !Number.isFinite(input.receivedAt.getTime())
    ) {
      throw new Error("Eve runtime event timestamp is invalid");
    }
    await db.transaction(async (transaction) => {
      await transaction.execute(
        sql\`select pg_advisory_xact_lock(hashtextextended(\${"eve-session:" + input.eveSessionId}, 0))\`,
      );
      const [recorded] = await transaction
        .insert(eveAgentRuntimeEvents)
        .values({
          eventAt: input.eventAt,
          eventId: input.eventId,
          eventType: input.eventType,
          eveSessionId: input.eveSessionId,
          receivedAt: input.receivedAt,
        })
        .onConflictDoNothing({ target: eveAgentRuntimeEvents.eventId })
        .returning({ eventId: eveAgentRuntimeEvents.eventId });
      // A replay can arrive after newer events. A last-event comparison is not
      // sufficient, and event timestamps are not a total order across Eve
      // workers. The append-only event-id table is the durable replay fence.
      if (!recorded) return;
      const [runtimeState] = await transaction
        .select({
          lastEventAt: eveAgentRuntimeSessions.lastEventAt,
          lastEventId: eveAgentRuntimeSessions.lastEventId,
        })
        .from(eveAgentRuntimeSessions)
        .where(eq(eveAgentRuntimeSessions.eveSessionId, input.eveSessionId))
        .limit(1);
      if (runtimeState) {
        await transaction
          .update(eveAgentRuntimeSessions)
          .set({
            lastEventAt: input.eventAt,
            lastEventId: input.eventId,
            updatedAt: input.receivedAt,
          })
          .where(eq(eveAgentRuntimeSessions.eveSessionId, input.eveSessionId));
      } else {
        await transaction.insert(eveAgentRuntimeSessions).values({
          eveSessionId: input.eveSessionId,
          lastEventAt: input.eventAt,
          lastEventId: input.eventId,
          updatedAt: input.receivedAt,
        });
      }

      let exactLeaseIsActive = false;
      if (input.leaseId !== undefined) {
        const [bound] = await transaction
          .update(eveAgentAdmissions)
          .set({ eveSessionId: input.eveSessionId })
          .where(
            and(
              eq(eveAgentAdmissions.id, input.leaseId),
              or(
                isNull(eveAgentAdmissions.eveSessionId),
                eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
              ),
            ),
          )
          .returning({ id: eveAgentAdmissions.id });
        if (!bound) throw new Error("Eve runtime event lease binding conflicted");
        const [exactLease] = await transaction
          .select({ releasedAt: eveAgentAdmissions.releasedAt })
          .from(eveAgentAdmissions)
          .where(eq(eveAgentAdmissions.id, input.leaseId))
          .limit(1);
        exactLeaseIsActive = exactLease?.releasedAt === null;
        // Never let a stale explicit lease selector fall back to every active
        // lease for the session. The signed callback may be replayed after a
        // later operation has acquired its own lease.
        if (!exactLeaseIsActive) return;
      }

      const compactLifecycleEvent =
        input.eventType === "compaction.requested" ||
        input.eventType === "compaction.completed";
      const terminalEvent = isTerminalEveRuntimeEvent(input.eventType);
      if (input.leaseId === undefined && !compactLifecycleEvent && !terminalEvent) return;
      const eligible = and(
        eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
        isNull(eveAgentAdmissions.releasedAt),
        input.leaseId !== undefined
          ? eq(eveAgentAdmissions.id, input.leaseId)
          : and(
              eq(eveAgentAdmissions.operation, "compact"),
              terminalEvent ? isNotNull(eveAgentAdmissions.lastRuntimeEventId) : undefined,
            ),
      );
      if (terminalEvent) {
        await transaction
          .update(eveAgentAdmissions)
          .set({
            lastRuntimeEventAt: input.eventAt,
            lastRuntimeEventId: input.eventId,
            releasedAt: input.receivedAt,
          })
          .where(eligible);
        return;
      }

      await transaction
        .update(eveAgentAdmissions)
        .set({
          expiresAt: new Date(input.receivedAt.getTime() + EVE_ADMISSION_LEASE_MS),
          lastRuntimeEventAt: input.eventAt,
          lastRuntimeEventId: input.eventId,
        })
        .where(
          eligible,
        );
    });
  },
} satisfies AgentAdmissionPort & AgentRuntimeAdmissionPort;
`,
  );
}
