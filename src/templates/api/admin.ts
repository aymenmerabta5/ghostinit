import { file, type TemplateFile } from "../shared.js";

const sharedProcedureImports = `import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error.js";
import type { ApiContext } from "../../context.js";`;

const applicationErrorMap = `APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED", APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN", APPLICATION_ADMIN_REQUIRED: "FORBIDDEN", APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS", APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE"`;

function compositionContent(): string {
  return `import "server-only";
import { auth } from "@repo/auth";
import { adminAuditEvents, db } from "@repo/database";
import { logger } from "@repo/observability";
import * as admin from "../../admin/index.js";

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
    .input(z.object({ search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(100).default(20) }))
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
    .input(z.object({ name: z.string().trim().min(1).max(80), email: z.string().email(), password: z.string().min(8).max(128), role: z.enum(["user", "admin"]) }))
    .output(z.object({ id: z.string(), name: z.string().nullable(), email: z.string().email(), role: z.enum(["user", "admin"]), banned: z.boolean() })),
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
    .errors({ UNAUTHORIZED: { message: "Authentication required" }, FORBIDDEN: { message: "Role change forbidden" }, TOO_MANY_REQUESTS: { message: "Too many requests" }, SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" }, NOT_FOUND: { message: "User not found" }, CONFLICT: { message: "The user changed concurrently" } })
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
      codeMap: { ${applicationErrorMap}, ADMIN_FORBIDDEN: "FORBIDDEN", ADMIN_ACTOR_BANNED: "FORBIDDEN", ADMIN_SELF_ACTION: "FORBIDDEN", ADMIN_LAST_ADMIN: "FORBIDDEN", ADMIN_USER_NOT_FOUND: "NOT_FOUND", ADMIN_CONCURRENT_MODIFICATION: "CONFLICT" },
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
    .errors({ UNAUTHORIZED: { message: "Authentication required" }, FORBIDDEN: { message: "Suspension change forbidden" }, TOO_MANY_REQUESTS: { message: "Too many requests" }, SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" }, NOT_FOUND: { message: "User not found" }, CONFLICT: { message: "The user changed concurrently" } })
    .input(z.object({ userId: z.string().min(1), banned: z.boolean(), reason: z.string().trim().min(1).max(240).optional() }))
    .output(z.object({ id: z.string(), banned: z.boolean() })),
};

export const adminSetBannedContract = contract.setBanned;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminSetBanned = implementer.setBanned.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.setBanned(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap}, ADMIN_FORBIDDEN: "FORBIDDEN", ADMIN_ACTOR_BANNED: "FORBIDDEN", ADMIN_SELF_ACTION: "FORBIDDEN", ADMIN_LAST_ADMIN: "FORBIDDEN", ADMIN_USER_NOT_FOUND: "NOT_FOUND", ADMIN_CONCURRENT_MODIFICATION: "CONFLICT" },
      fallbackMessage: "Unable to change suspension",
    });
  }
});
`;
}

export function adminApiFiles(): TemplateFile[] {
  return [
    file("packages/services/src/application/composition/admin.ts", compositionContent()),
    file("packages/api/src/procedures/admin/list-users.ts", listUsersContent()),
    file("packages/api/src/procedures/admin/create-user.ts", createUserContent()),
    file("packages/api/src/procedures/admin/change-role.ts", changeRoleContent()),
    file("packages/api/src/procedures/admin/set-banned.ts", setBannedContent()),
  ];
}
