// @allow-long 369: one renderer emits the admin contracts, policies, ports, facade, and identity adapter
import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";

function serviceRoot(mode: ProjectMode): string {
  return mode === "monorepo" ? "packages/services/src/admin" : "src/server/services/admin";
}

function contractsContent(): string {
  return `import "server-only";

export const ADMIN_USER_ROLES = ["user", "admin"] as const;
export type AdminUserRole = (typeof ADMIN_USER_ROLES)[number];

export interface AdminActor {
  id: string;
  role: AdminUserRole;
  banned: boolean;
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: AdminUserRole;
  banned: boolean;
}

export interface ListAdminUsersInput {
  search?: string;
  page: number;
  limit: number;
}

export interface ListAdminUsersResult {
  users: AdminUser[];
  total: number;
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  password: string;
  role: AdminUserRole;
}

export type AdminAuditAction = "admin.user.created" | "admin.user.role_changed" | "admin.user.ban_changed";

export interface AdminAuditEvent {
  action: AdminAuditAction;
  actorId: string;
  targetId: string;
  metadata: Record<string, string | number | boolean | null>;
  occurredAt: Date;
}
`;
}

function portsContent(): string {
  return `import "server-only";
import type {
  AdminActor,
  AdminAuditEvent,
  AdminUser,
  AdminUserRole,
  CreateAdminUserInput,
  ListAdminUsersInput,
  ListAdminUsersResult,
} from "./contracts.js";

export interface AdminIdentityPort {
  listUsers(input: ListAdminUsersInput): Promise<ListAdminUsersResult>;
  getUser(userId: string): Promise<AdminUser | null>;
  countAdmins(): Promise<number>;
  /**
   * Non-Postgres providers may own creation in one native transaction. The
   * Postgres Better Auth read adapter deliberately omits this optional method;
   * its composition root must provide AdminUserCreationPort instead.
   */
  createUser?(input: CreateAdminUserInput): Promise<AdminUser>;
  changeRole(userId: string, role: AdminUserRole): Promise<void>;
  setBanned(userId: string, banned: boolean, reason?: string): Promise<void>;
}

export interface CreateAdminUserCommand {
  actor: AdminActor;
  input: CreateAdminUserInput;
  occurredAt: Date;
}

/** Commits the identity, credential account, and mandatory audit as one unit. */
export interface AdminUserCreationPort {
  createUserWithAudit(command: CreateAdminUserCommand): Promise<AdminUser>;
}

export interface AdminAuditPort {
  record(event: AdminAuditEvent): Promise<void>;
}
`;
}

function errorsContent(): string {
  return `import "server-only";

export class AdminServiceError<TCode extends string = string> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AdminServiceError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
`;
}

function policyContent(): string {
  return `import "server-only";
import { AdminServiceError } from "./errors.js";
import type { AdminActor, AdminUser, AdminUserRole } from "./contracts.js";

export type AdminPolicyErrorCode =
  | "ADMIN_FORBIDDEN"
  | "ADMIN_ACTOR_BANNED"
  | "ADMIN_SELF_ACTION"
  | "ADMIN_LAST_ADMIN";

export function assertAdminActor(actor: AdminActor): void {
  if (actor.banned) throw new AdminServiceError<AdminPolicyErrorCode>("ADMIN_ACTOR_BANNED", "Suspended accounts cannot administer users");
  if (actor.role !== "admin") throw new AdminServiceError<AdminPolicyErrorCode>("ADMIN_FORBIDDEN", "Administrator access is required");
}

export function assertCanChangeRole(actor: AdminActor, target: AdminUser, role: AdminUserRole, adminCount: number): void {
  assertAdminActor(actor);
  if (actor.id === target.id && role !== "admin") {
    throw new AdminServiceError<AdminPolicyErrorCode>("ADMIN_SELF_ACTION", "You cannot remove your own administrator role");
  }
  if (target.role === "admin" && role !== "admin" && adminCount <= 1) {
    throw new AdminServiceError<AdminPolicyErrorCode>("ADMIN_LAST_ADMIN", "The final administrator cannot be demoted");
  }
}

export function assertCanChangeBan(actor: AdminActor, target: AdminUser): void {
  assertAdminActor(actor);
  if (actor.id === target.id) {
    throw new AdminServiceError<AdminPolicyErrorCode>("ADMIN_SELF_ACTION", "You cannot change your own suspension state");
  }
}
`;
}

function facadeContent(): string {
  return `import "server-only";
import { AdminServiceError } from "./errors.js";
import { assertAdminActor, assertCanChangeBan, assertCanChangeRole } from "./policy.js";
import type { AdminAuditPort, AdminIdentityPort, AdminUserCreationPort } from "./ports.js";
import type { AdminActor, AdminUserRole, CreateAdminUserInput, ListAdminUsersInput } from "./contracts.js";

export interface AdminServiceDependencies {
  identity: AdminIdentityPort;
  audit: AdminAuditPort;
  userCreation?: AdminUserCreationPort;
  now?: () => Date;
}

export function createAdminService({ identity, audit, userCreation, now = () => new Date() }: AdminServiceDependencies) {
  return {
    async listUsers(actor: AdminActor, input: ListAdminUsersInput) {
      assertAdminActor(actor);
      return await identity.listUsers(input);
    },
    async createUser(actor: AdminActor, input: CreateAdminUserInput) {
      assertAdminActor(actor);
      const occurredAt = now();
      if (userCreation) {
        return await userCreation.createUserWithAudit({ actor, input, occurredAt });
      }
      if (!identity.createUser) {
        throw new AdminServiceError(
          "ADMIN_ATOMIC_CREATE_REQUIRED",
          "This identity adapter requires an atomic user-creation port",
        );
      }
      const user = await identity.createUser(input);
      await audit.record({
        action: "admin.user.created",
        actorId: actor.id,
        targetId: user.id,
        metadata: { role: user.role },
        occurredAt,
      });
      return user;
    },
    async changeRole(actor: AdminActor, targetId: string, role: AdminUserRole) {
      assertAdminActor(actor);
      const target = await identity.getUser(targetId);
      if (!target) throw new AdminServiceError("ADMIN_USER_NOT_FOUND", "User not found");
      const adminCount = target.role === "admin" && role !== "admin" ? await identity.countAdmins() : 2;
      assertCanChangeRole(actor, target, role, adminCount);
      await identity.changeRole(targetId, role);
      await audit.record({
        action: "admin.user.role_changed",
        actorId: actor.id,
        targetId,
        metadata: { previousRole: target.role, role },
        occurredAt: now(),
      });
      return { id: targetId, role };
    },
    async setBanned(actor: AdminActor, targetId: string, banned: boolean, reason?: string) {
      assertAdminActor(actor);
      const target = await identity.getUser(targetId);
      if (!target) throw new AdminServiceError("ADMIN_USER_NOT_FOUND", "User not found");
      assertCanChangeBan(actor, target);
      await identity.setBanned(targetId, banned, reason);
      await audit.record({
        action: "admin.user.ban_changed",
        actorId: actor.id,
        targetId,
        metadata: { banned, reason: reason ?? null },
        occurredAt: now(),
      });
      return { id: targetId, banned };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
`;
}

function betterAuthAdapterContent(): string {
  return `import "server-only";
import type { AdminIdentityPort } from "./ports.js";
import type { AdminUser, AdminUserRole } from "./contracts.js";

interface BetterAuthAdminUser {
  id: string;
  name: string;
  email: string;
  role?: unknown;
  banned?: boolean | null;
}

/**
 * Application-owned view of the Better Auth admin API.
 *
 * Keeping this structural contract here prevents the application service package
 * from depending on the concrete auth package while still checking the adapter
 * against the real Better Auth server at the API composition root.
 */
export interface BetterAuthAdminApi {
  readonly api: {
    listUsers(input: {
      headers: Headers;
      query: {
        limit: number;
        offset?: number;
        searchValue?: string;
        searchField?: "email";
        searchOperator?: "contains";
        filterField?: "role";
        filterValue?: "admin";
        filterOperator?: "eq";
      };
    }): Promise<{ users: BetterAuthAdminUser[]; total: number }>;
    getUser(input: {
      headers: Headers;
      query: { id: string };
    }): Promise<BetterAuthAdminUser | null>;
    setRole(input: {
      headers: Headers;
      body: { userId: string; role: AdminUserRole };
    }): Promise<unknown>;
    banUser(input: {
      headers: Headers;
      body: { userId: string; banReason?: string };
    }): Promise<unknown>;
    unbanUser(input: {
      headers: Headers;
      body: { userId: string };
    }): Promise<unknown>;
  };
}

function toAdminRole(role: unknown): AdminUserRole {
  return role === "admin" ? "admin" : "user";
}

function toAdminUser(user: { id: string; name: string; email: string; role?: unknown; banned?: boolean | null }): AdminUser {
  return {
    id: user.id,
    name: user.name || null,
    email: user.email,
    role: toAdminRole(user.role),
    banned: user.banned === true,
  };
}

export function createBetterAuthAdminIdentityPort(auth: BetterAuthAdminApi, headers: Headers): AdminIdentityPort {
  return {
    async listUsers(input) {
      const result = await auth.api.listUsers({
        headers,
        query: {
          limit: input.limit,
          offset: (input.page - 1) * input.limit,
          searchValue: input.search || undefined,
          searchField: "email",
          searchOperator: "contains",
        },
      });
      return { users: result.users.map(toAdminUser), total: result.total };
    },
    async getUser(userId) {
      const user = await auth.api.getUser({ headers, query: { id: userId } });
      return user ? toAdminUser(user) : null;
    },
    async countAdmins() {
      const result = await auth.api.listUsers({
        headers,
        query: { limit: 100, filterField: "role", filterValue: "admin", filterOperator: "eq" },
      });
      return result.total;
    },
    async changeRole(userId, role) {
      await auth.api.setRole({ headers, body: { userId, role } });
    },
    async setBanned(userId, banned, reason) {
      if (banned) {
        await auth.api.banUser({ headers, body: { userId, banReason: reason } });
      } else {
        await auth.api.unbanUser({ headers, body: { userId } });
      }
    },
  };
}
`;
}

function indexContent(hasBetterAuthAdapter: boolean): string {
  return `export { createAdminService, type AdminService, type AdminServiceDependencies } from "./facade.js";
export { AdminServiceError } from "./errors.js";
export { assertAdminActor, assertCanChangeBan, assertCanChangeRole, type AdminPolicyErrorCode } from "./policy.js";
export { ADMIN_USER_ROLES } from "./contracts.js";
export type { AdminActor, AdminAuditAction, AdminAuditEvent, AdminUser, AdminUserRole, CreateAdminUserInput, ListAdminUsersInput, ListAdminUsersResult } from "./contracts.js";
export type { AdminAuditPort, AdminIdentityPort, AdminUserCreationPort, CreateAdminUserCommand } from "./ports.js";
${hasBetterAuthAdapter ? `export { createBetterAuthAdminIdentityPort, type BetterAuthAdminApi } from "./better-auth-adapter.js";\n` : ""}`;
}

export function adminServiceFiles(
  mode: ProjectMode,
  database: "postgres" | "convex",
): TemplateFile[] {
  const root = serviceRoot(mode);
  const withBetterAuthAdapter = database === "postgres";
  return [
    file(`${root}/contracts.ts`, contractsContent()),
    file(`${root}/ports.ts`, portsContent()),
    file(`${root}/errors.ts`, errorsContent()),
    file(`${root}/policy.ts`, policyContent()),
    file(`${root}/facade.ts`, facadeContent()),
    ...(withBetterAuthAdapter
      ? [file(`${root}/better-auth-adapter.ts`, betterAuthAdapterContent())]
      : []),
    file(`${root}/index.ts`, indexContent(withBetterAuthAdapter)),
  ];
}
