import { describe, expect, test } from "bun:test";
import { apiPackage } from "../../src/templates/api.js";
import { adminServiceFiles } from "../../src/templates/services/admin.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function byPath(files: ReadonlyArray<{ path: string; content: string }>): Map<string, string> {
  return new Map(files.map((entry) => [entry.path, entry.content]));
}

describe("generated admin service architecture", () => {
  test("emits application-owned ports, policies, facade, and the Postgres identity adapter", () => {
    const files = byPath(adminServiceFiles("monorepo", "postgres"));
    const facade = files.get("packages/services/src/admin/facade.ts") ?? "";
    const ports = files.get("packages/services/src/admin/ports.ts") ?? "";
    const policy = files.get("packages/services/src/admin/policy.ts") ?? "";
    const errors = files.get("packages/services/src/admin/errors.ts") ?? "";
    const adapter = files.get("packages/services/src/admin/better-auth-adapter.ts") ?? "";

    expect(ports).toContain("export interface AdminIdentityPort");
    expect(ports).toContain("export interface AdminAuditPort");
    expect(ports).toContain("export interface AdminUserCreationPort");
    expect(ports).toContain("createUserWithAudit(command: CreateAdminUserCommand)");
    expect(facade).toContain("export function createAdminService");
    expect(facade).toContain("AdminAuditPort, AdminIdentityPort, AdminUserCreationPort");
    expect(facade).toContain("await audit.record");
    expect(facade).toContain("userCreation.createUserWithAudit({ actor, input, occurredAt })");
    expect(facade).toContain("ADMIN_ATOMIC_CREATE_REQUIRED");
    expect(policy).toContain("ADMIN_SELF_ACTION");
    expect(policy).toContain("ADMIN_LAST_ADMIN");
    expect(errors).toContain("export class AdminServiceError");
    expect(`${facade}\n${policy}`).not.toContain("../errors.js");
    expect(adapter).toContain("createBetterAuthAdminIdentityPort");
    expect(adapter).toContain("export interface BetterAuthAdminApi");
    expect(adapter).toContain("auth: BetterAuthAdminApi");
    expect(adapter).toContain("auth.api.listUsers");
    expect(adapter).not.toContain("auth.api.createUser");
    expect(adapter).not.toContain("authClient.admin");
    expect(adapter).not.toContain("@repo/auth");
    expect(adapter).not.toContain("@/server/auth");
    expect([...files.values()].join("\n")).not.toContain("as unknown as");
  });

  test("keeps the single-mode admin adapter behind the same application-owned auth contract", () => {
    const files = byPath(adminServiceFiles("single", "postgres"));
    const adapter = files.get("src/server/services/admin/better-auth-adapter.ts") ?? "";

    expect(adapter).toContain("export interface BetterAuthAdminApi");
    expect(adapter).toContain("auth: BetterAuthAdminApi");
    expect(adapter).not.toContain("@repo/auth");
    expect(adapter).not.toContain("@/server/auth");
  });

  test("does not leak the Better Auth server adapter into Convex service output", () => {
    const paths = adminServiceFiles("monorepo", "convex").map((entry) => entry.path);
    expect(paths).not.toContain("packages/services/src/admin/better-auth-adapter.ts");
  });

  test("omits the admin capability package when no database can implement its port", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "admin-none",
        mode: "monorepo",
        framework: "nextjs",
        preset: "custom",
        database: "none",
        auth: true,
        api: false,
        email: false,
        analytics: false,
        billing: [],
        apps: ["web"],
      }),
    );
    const paths = files.map((entry) => entry.path);
    const servicesIndex = files.find((entry) => entry.path === "packages/services/src/index.ts");

    expect(paths.some((path) => path.startsWith("packages/services/src/admin/"))).toBe(false);
    expect(servicesIndex?.content ?? "").not.toContain('from "./admin/index.js"');
  });

  test("wires thin typed oRPC procedures through composition and the service facade", () => {
    const files = byPath(apiPackage(false, false, true));
    const manifest = JSON.parse(files.get("packages/api/package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
    };
    const context = files.get("packages/api/src/context.ts") ?? "";
    const contract = files.get("packages/api/src/contract.ts") ?? "";
    const router = files.get("packages/api/src/router.ts") ?? "";
    const changeRole = files.get("packages/api/src/procedures/admin/change-role.ts") ?? "";

    expect(manifest.dependencies?.["@repo/services"]).toBe("workspace:*");
    expect(manifest.dependencies?.["@repo/observability"]).toBe("workspace:*");
    expect(context).toContain("headers: Headers");
    expect(contract).toContain("adminUsers:");
    expect(contract).toContain("changeRole: adminChangeRoleContract");
    expect(router).toContain('os.$context<ApiContext>().prefix("/api").router');
    expect(router).toContain("changeRole: adminChangeRole");
    expect(changeRole).toContain("context.application.admin.changeRole(input)");
    expect(changeRole).not.toContain("createAdminServiceForRequest");
    expect(changeRole).not.toContain("adminProcedure");
    expect(changeRole).toContain('ADMIN_CONCURRENT_MODIFICATION: "CONFLICT"');
    expect(changeRole).not.toContain("@repo/database");
    expect(changeRole).not.toContain("@repo/auth");
    expect(changeRole).not.toContain("as unknown as");
  });

  test("persists Postgres audit events through the composition adapter", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "admin-postgres",
        mode: "monorepo",
        framework: "nextjs",
        preset: "saas",
        database: "postgres",
        billing: [],
        apps: ["web"],
      }),
    );
    const schema = files.find((entry) => entry.path === "packages/database/src/schema/auth.ts");
    const composition = files.find(
      (entry) => entry.path === "packages/services/src/application/composition/admin.ts",
    );
    const servicesManifest = JSON.parse(
      files.find((entry) => entry.path === "packages/services/package.json")?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };

    expect(schema?.content ?? "").toContain('pgTable("admin_audit_events"');
    expect(schema?.content ?? "").toContain('jsonb("metadata")');
    expect(servicesManifest.dependencies?.["@repo/auth"]).toBe("workspace:*");
    expect(composition?.content ?? "").toContain("await database.insert(adminAuditEvents).values");
    expect(composition?.content ?? "").toContain("await persistAdminAudit(transaction, audit)");
    expect(composition?.content ?? "").toContain("createdAt: event.occurredAt");
    expect(composition?.content ?? "").toContain(
      "createUserWithAudit(command: admin.CreateAdminUserCommand)",
    );
  });

  test("allows the API package to traverse source-exported auth email JSX", () => {
    const files = byPath(apiPackage(false, false, true));
    const config = JSON.parse(files.get("packages/api/tsconfig.json") ?? "{}") as {
      compilerOptions?: Record<string, unknown>;
    };

    expect(config.compilerOptions?.jsx).toBe("react-jsx");
  });

  test("omits every admin transport artifact when the database does not support it", () => {
    const files = byPath(apiPackage(false, false, false));
    expect(files.has("packages/api/src/composition/admin.ts")).toBe(false);
    expect(files.has("packages/api/src/procedures/admin/list-users.ts")).toBe(false);
    expect(files.get("packages/api/src/contract.ts") ?? "").not.toContain("adminUsers");
    expect(files.get("packages/api/src/router.ts") ?? "").not.toContain("adminUsers");
  });

  test("builds Convex API context from the app-owned request actor", () => {
    const files = byPath(apiPackage(false, false, false, true, { auth: true }));
    const context = files.get("packages/api/src/context.ts") ?? "";

    expect(context).toContain('import { getRequestUser } from "@repo/auth"');
    expect(context).toContain("const actor = await getRequestUser()");
    expect(context).toContain("id: String(actor._id)");
    expect(context).not.toContain("auth.api.getSession");
  });
});
