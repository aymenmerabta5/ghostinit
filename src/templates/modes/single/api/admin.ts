// @allow-long 400: one renderer emits the cohesive single-mode admin transport and composition modules
import { file, type TemplateFile } from "../../../shared.js";
import { apiRateLimitContent } from "../../../api/rate-limit.js";

const sharedProcedureImports = `import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error.js";
import type { ApiContext } from "../../context.js";`;

const applicationErrorMap = `APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED", APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN", APPLICATION_ADMIN_REQUIRED: "FORBIDDEN", APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS", APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE"`;

function authMiddlewareContent(): string {
  return `import { ORPCError } from "@orpc/server";
import type { ApiContext } from "../context.js";
import { createCodedORPCError } from "../utils/service-error.js";

export async function protectedProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
  if (ctx.user.banned) {
    throw createCodedORPCError("FORBIDDEN", "ACCOUNT_SUSPENDED", {
      message: "Suspended accounts cannot access this resource",
    });
  }
  return ctx.user;
}

export async function adminProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
  if (ctx.user.role !== "admin" && ctx.user.role !== "superAdmin") {
    throw new ORPCError("FORBIDDEN", { message: "Administrator access required" });
  }
  return ctx.user;
}
`;
}

function serviceErrorContent(): string {
  return `import { ORPCError } from "@orpc/server";

type ORPCStatusCode = ConstructorParameters<typeof ORPCError>[0];

interface CodedORPCErrorOptions {
  message: string;
  meta?: Record<string, unknown>;
  cause?: unknown;
}

interface CodedORPCErrorData {
  code: string;
  meta?: Record<string, unknown>;
}

interface CodedServiceError extends Error {
  code: string;
  meta?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCodedServiceError(error: unknown): error is CodedServiceError {
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") {
    return false;
  }
  return !("meta" in error) || error.meta === undefined || isRecord(error.meta);
}

const requestApplicationCodeAliases: Readonly<Record<string, string>> = {
  APPLICATION_UNAUTHENTICATED: "UNAUTHENTICATED",
  APPLICATION_ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
  APPLICATION_EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  APPLICATION_ADMIN_REQUIRED: "ADMIN_FORBIDDEN",
  APPLICATION_CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  APPLICATION_BAD_REQUEST: "BAD_REQUEST",
  APPLICATION_NOT_FOUND: "NOT_FOUND",
  APPLICATION_NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  APPLICATION_CONFLICT: "CONFLICT",
  APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS",
  APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  APPLICATION_INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
};

export function createCodedORPCError(
  status: ORPCStatusCode,
  code: string,
  { message, meta, cause }: CodedORPCErrorOptions,
) {
  return new ORPCError<ORPCStatusCode, CodedORPCErrorData>(status, {
    message,
    data: { code, ...(meta ? { meta } : {}) },
    cause,
  });
}

export function throwCodedORPCError(
  status: ORPCStatusCode,
  code: string,
  options: CodedORPCErrorOptions,
): never {
  throw createCodedORPCError(status, code, options);
}

export function createServiceORPCError(
  error: unknown,
  {
    codeMap,
    fallbackMessage,
    fallbackCode = "BAD_REQUEST",
  }: {
    codeMap: Record<string, ORPCStatusCode>;
    fallbackMessage: string;
    fallbackCode?: ORPCStatusCode;
  },
): never {
  if (error instanceof ORPCError) throw error;
  if (isCodedServiceError(error)) {
    const publicCode = requestApplicationCodeAliases[error.code] ?? error.code;
    throw createCodedORPCError(codeMap[error.code] ?? fallbackCode, publicCode, {
      message: error.message,
      meta: error.meta,
      cause: error.cause ?? error,
    });
  }
  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: fallbackMessage, cause: error });
}
`;
}

function compositionContent(): string {
  return `import "server-only";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { adminAuditEvents } from "@/server/db/schema/auth";
import { logger } from "@/server/observability";
import * as admin from "@/server/services/admin";

export function createAdminServiceForRequest(headers: Headers): admin.AdminService {
  const identity = admin.createBetterAuthAdminIdentityPort(auth, headers);
  return admin.createAdminService({
    identity,
    audit: {
      async record(event) {
        await db.insert(adminAuditEvents).values({
          action: event.action,
          actorId: event.actorId,
          targetId: event.targetId,
          metadata: event.metadata,
          createdAt: event.occurredAt,
        });
        logger.info("Admin audit event", {
          action: event.action,
          actorId: event.actorId,
          targetId: event.targetId,
          occurredAt: event.occurredAt.toISOString(),
          ...event.metadata,
        });
      },
    },
  });
}
`;
}

function convexCompositionContent(): string {
  return `import "server-only";
import { auth, fetchAuthMutation, fetchAuthQuery } from "@/server/auth";
import { logger } from "@/server/observability";
import * as admin from "@/server/services/admin";
import { api } from "../../../../../convex/_generated/api";

interface ConvexAdminUser {
  _id: string;
  authId: string;
  name?: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
}

interface ConvexPage {
  page: ConvexAdminUser[];
  isDone: boolean;
  continueCursor: string;
}

function toAdminUser(user: ConvexAdminUser): admin.AdminUser {
  return {
    id: user.authId,
    name: user.name ?? null,
    email: user.email,
    role: user.role === "admin" ? "admin" : "user",
    banned: user.banned === true,
  };
}

async function listAllUsers(): Promise<ConvexAdminUser[]> {
  const users: ConvexAdminUser[] = [];
  let cursor: string | null = null;
  do {
    const result = await fetchAuthQuery(api.users.list, {
      paginationOpts: { cursor, numItems: 100 },
    }) as ConvexPage;
    users.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return users;
}

async function createUserThroughVerifiedAdmin(input: admin.CreateAdminUserInput): Promise<admin.AdminUser> {
  const response = await auth.handler(new Request("http://ghostinit.local/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: input.email, name: input.name, password: input.password }),
  }));
  if (!response.ok) throw new admin.AdminServiceError("ADMIN_CREATE_FAILED", "Unable to create user");
  const result = await response.json() as { user?: { id?: string; email?: string; name?: string | null } };
  const userId = result.user?.id;
  if (!userId || !result.user?.email) {
    throw new admin.AdminServiceError("ADMIN_CREATE_FAILED", "The identity provider returned an invalid user");
  }
  if (input.role === "admin") {
    await fetchAuthMutation(api.users.setRoleByAuthId, { authId: userId, role: "admin" });
  }
  return { id: userId, email: result.user.email, name: result.user.name ?? null, role: input.role, banned: false };
}

export function createAdminServiceForRequest(_headers: Headers): admin.AdminService {
  const identity: admin.AdminIdentityPort = {
    async listUsers(input) {
      const all = await listAllUsers();
      const search = input.search?.trim().toLowerCase();
      const filtered = search
        ? all.filter((user) => user.email.toLowerCase().includes(search) || (user.name ?? "").toLowerCase().includes(search))
        : all;
      const offset = (input.page - 1) * input.limit;
      return { users: filtered.slice(offset, offset + input.limit).map(toAdminUser), total: filtered.length };
    },
    async getUser(userId) {
      const user = (await listAllUsers()).find((candidate) => candidate.authId === userId);
      return user ? toAdminUser(user) : null;
    },
    async countAdmins() {
      return (await listAllUsers()).filter((user) => user.role === "admin" && user.banned !== true).length;
    },
    createUser: createUserThroughVerifiedAdmin,
    async changeRole(userId, role) {
      await fetchAuthMutation(api.users.setRoleByAuthId, { authId: userId, role });
    },
    async setBanned(userId, banned, reason) {
      await fetchAuthMutation(api.users.setBannedByAuthId, {
        authId: userId,
        banned,
        ...(reason ? { reason } : {}),
      });
    },
  };
  return admin.createAdminService({
    identity,
    // Convex role/ban mutations already persist authoritative audit rows. This
    // port records the facade-level event without attempting a second write.
    audit: { async record(event) { logger.info("Admin audit event", { ...event, occurredAt: event.occurredAt.toISOString() }); } },
  });
}
`;
}

function listUsersContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedProcedureImports}

const adminUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
  banned: z.boolean(),
});

const contract = {
  list: oc
    .route({ method: "GET", path: "/admin/users" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Administrator access required" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      INTERNAL_SERVER_ERROR: { message: "Unable to list users" },
    })
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .output(z.object({ users: z.array(adminUserSchema), total: z.number().int().nonnegative() })),
};

export const adminListUsersContract = contract.list;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminListUsers = implementer.list.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.listUsers(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap}, ADMIN_FORBIDDEN: "FORBIDDEN", ADMIN_ACTOR_BANNED: "FORBIDDEN" },
      fallbackMessage: "Unable to list users",
    });
  }
});
`;
}

function createUserContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedProcedureImports}

const adminUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
  banned: z.boolean(),
});

const contract = {
  create: oc
    .route({ method: "POST", path: "/admin/users" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Administrator access required" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      BAD_REQUEST: { message: "Unable to create user" },
    })
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        role: z.enum(["user", "admin"]),
      }),
    )
    .output(adminUserSchema),
};

export const adminCreateUserContract = contract.create;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminCreateUser = implementer.create.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.createUser(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap}, ADMIN_FORBIDDEN: "FORBIDDEN", ADMIN_ACTOR_BANNED: "FORBIDDEN" },
      fallbackMessage: "Unable to create user",
      fallbackCode: "BAD_REQUEST",
    });
  }
});
`;
}

function changeRoleContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedProcedureImports}

const contract = {
  changeRole: oc
    .route({ method: "PATCH", path: "/admin/users/{userId}/role" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Role change forbidden" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      NOT_FOUND: { message: "User not found" },
      CONFLICT: { message: "The user changed concurrently" },
    })
    .input(z.object({ userId: z.string().min(1), role: z.enum(["user", "admin"]) }))
    .output(z.object({ id: z.string(), role: z.enum(["user", "admin"]) })),
};

export const adminChangeRoleContract = contract.changeRole;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminChangeRole = implementer.changeRole.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.changeRole(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: {
        ${applicationErrorMap},
        ADMIN_FORBIDDEN: "FORBIDDEN",
        ADMIN_ACTOR_BANNED: "FORBIDDEN",
        ADMIN_SELF_ACTION: "FORBIDDEN",
        ADMIN_LAST_ADMIN: "FORBIDDEN",
        ADMIN_USER_NOT_FOUND: "NOT_FOUND",
        ADMIN_CONCURRENT_MODIFICATION: "CONFLICT",
      },
      fallbackMessage: "Unable to change role",
    });
  }
});
`;
}

function setBannedContent(): string {
  return `import { oc } from "@orpc/contract";
import { z } from "zod";
${sharedProcedureImports}

const contract = {
  setBanned: oc
    .route({ method: "PATCH", path: "/admin/users/{userId}/ban" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Suspension change forbidden" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      NOT_FOUND: { message: "User not found" },
      CONFLICT: { message: "The user changed concurrently" },
    })
    .input(
      z.object({
        userId: z.string().min(1),
        banned: z.boolean(),
        reason: z.string().trim().min(1).max(240).optional(),
      }),
    )
    .output(z.object({ id: z.string(), banned: z.boolean() })),
};

export const adminSetBannedContract = contract.setBanned;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminSetBanned = implementer.setBanned.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.setBanned(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: {
        ${applicationErrorMap},
        ADMIN_FORBIDDEN: "FORBIDDEN",
        ADMIN_ACTOR_BANNED: "FORBIDDEN",
        ADMIN_SELF_ACTION: "FORBIDDEN",
        ADMIN_LAST_ADMIN: "FORBIDDEN",
        ADMIN_USER_NOT_FOUND: "NOT_FOUND",
        ADMIN_CONCURRENT_MODIFICATION: "CONFLICT",
      },
      fallbackMessage: "Unable to change suspension",
    });
  }
});
`;
}

export function singleApiSupportFiles(): TemplateFile[] {
  return [
    file("src/server/api/middleware/auth.ts", authMiddlewareContent()),
    file("src/server/api/middleware/rate-limit.ts", apiRateLimitContent()),
    ...singleServiceErrorFiles(),
  ];
}

export function singleServiceErrorFiles(): TemplateFile[] {
  return [file("src/server/api/utils/service-error.ts", serviceErrorContent())];
}

export function singleAdminApiFiles(database: "postgres" | "convex" = "postgres"): TemplateFile[] {
  return [
    ...singleApiSupportFiles(),
    file(
      "src/server/services/application/composition/admin.ts",
      database === "convex" ? convexCompositionContent() : compositionContent(),
    ),
    file("src/server/api/procedures/admin/list-users.ts", listUsersContent()),
    file("src/server/api/procedures/admin/create-user.ts", createUserContent()),
    file("src/server/api/procedures/admin/change-role.ts", changeRoleContent()),
    file("src/server/api/procedures/admin/set-banned.ts", setBannedContent()),
  ];
}
