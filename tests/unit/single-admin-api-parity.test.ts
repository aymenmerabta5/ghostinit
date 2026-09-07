import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex" | "none";

function generate(
  framework: Framework,
  database: Database,
  overrides: Record<string, unknown> = {},
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "single-admin-api",
      runtime: "bun",
      version: "0.1.0",
      mode: "single",
      framework,
      database,
      billing: [],
      features: [],
      apps: ["web"],
      ...overrides,
    }),
  );
}

function read(files: TemplateFile[], path: string): string {
  return files.find((entry) => entry.path === path)?.content ?? "";
}

const adminApiPaths = [
  "src/server/api/middleware/auth.ts",
  "src/server/api/middleware/rate-limit.ts",
  "src/server/api/utils/service-error.ts",
  "src/server/services/application/composition/admin.ts",
  "src/server/api/procedures/admin/list-users.ts",
  "src/server/api/procedures/admin/create-user.ts",
  "src/server/api/procedures/admin/change-role.ts",
  "src/server/api/procedures/admin/set-banned.ts",
] as const;

describe("single-mode admin API parity", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework}/postgres emits thin typed admin oRPC procedures`, () => {
      const files = generate(framework, "postgres");
      const paths = files.map((entry) => entry.path);
      for (const path of adminApiPaths) expect(paths).toContain(path);

      const contract = read(files, "src/server/api/contract.ts");
      const router = read(files, "src/server/api/router.ts");
      for (const operation of ["list", "create", "changeRole", "setBanned"] as const) {
        expect(contract).toContain(`${operation}: admin`);
        expect(router).toContain(`${operation}: admin`);
      }
      expect(contract).toContain("adminUsers:");
      expect(router).toContain("adminUsers:");
      expect(router).toContain('os.$context<ApiContext>().prefix("/api").router(');

      const procedures = adminApiPaths
        .filter((path) => path.includes("/procedures/"))
        .map((path) => read(files, path))
        .join("\n");
      expect(procedures).toContain("context.application.admin.listUsers(input)");
      expect(procedures).toContain("context.application.admin.createUser(input)");
      expect(procedures).toContain("context.application.admin.changeRole(input)");
      expect(procedures).toContain("context.application.admin.setBanned(input)");
      expect(procedures).not.toMatch(/createAdminServiceForRequest|adminProcedure|rateLimitStrict/);
      expect(procedures).not.toContain('from "@/server/db"');
      expect(procedures).not.toContain("better-auth");
      expect(procedures).not.toContain("as unknown as");
      expect(procedures).not.toContain("as any");
      expect(procedures).not.toContain("export *");

      expect(read(files, "src/server/api/procedures/admin/change-role.ts")).toContain(
        'ADMIN_CONCURRENT_MODIFICATION: "CONFLICT"',
      );
      expect(read(files, "src/server/api/procedures/admin/set-banned.ts")).toContain(
        'ADMIN_LAST_ADMIN: "FORBIDDEN"',
      );

      const composition = read(files, "src/server/services/application/composition/admin.ts");
      expect(composition).toContain('import { auth } from "@/server/auth"');
      expect(composition).toContain('import { db } from "@/server/db"');
      expect(composition).toMatch(
        /import \{[^}]*adminAuditEvents[^}]*\} from "@\/server\/db\/schema\/auth"/,
      );
      expect(composition).toContain('import { logger } from "@/server/observability"');
      expect(composition).toContain('import * as admin from "@/server/services/admin"');
      expect(composition).toContain("admin.createBetterAuthAdminIdentityPort(auth, headers)");
      expect(composition).toContain("await database.insert(adminAuditEvents).values({");
      expect(composition).toContain("await persistAdminAudit(transaction, audit)");
      expect(composition).toContain('logger.info("Admin audit event"');

      const rateLimit = read(files, "src/server/api/middleware/rate-limit.ts");
      expect(rateLimit).toContain("export async function rateLimit(");
      expect(rateLimit).toContain("export async function rateLimitStrict");
      expect(rateLimit).toContain("await rateLimit(key, 20, 60_000)");
      expect(rateLimit).toContain('new ORPCError("TOO_MANY_REQUESTS"');
      expect(rateLimit).toContain("Shared API rate limiting is not configured");
      expect(rateLimit).toContain("AbortSignal.timeout(REDIS_DEADLINE_MS)");

      const context = read(files, "src/server/api/context.ts");
      expect(context).toContain("createRequestApplicationForRequest(headers)");
      expect(context).toContain("const principal = application.principal");
      expect(context).toContain("headers: Headers");
      const applicationServer = read(files, "src/server/services/application/server.ts");
      expect(applicationServer).toContain("auth.api.getSession({");
      expect(applicationServer).toContain("disableCookieCache: true");
      expect(applicationServer).toContain("disableRefresh: true");
      expect(applicationServer).toContain("resolveIdentityActorForRequest");
      expect(context).toContain("identityActor: suspended ? null : identityActor");
      expect(context).toContain("emailVerified: boolean;");
      expect(context).toContain("emailVerified: principal.emailVerified");

      const auth = read(files, "src/server/auth/index.ts");
      expect(auth).toContain(
        'export type Auth = Pick<BetterAuthServer<PortableAuthOptions>, "handler" | "api"> & {',
      );
      expect(auth).toContain("readonly $context: Promise<AdminCreationAuthContext>;");
      expect(auth).toContain("export const auth: Auth = configuredAuth;");
      expect(auth).not.toContain("export type Auth = typeof auth;");
      expect(paths).toContain("src/server/services/admin/better-auth-adapter.ts");
      const authSchema = read(files, "src/server/db/schema/auth.ts");
      expect(authSchema).toContain("banned: boolean('banned').default(false)");
      expect(authSchema).toContain("banReason: text('ban_reason')");
      expect(authSchema).toContain("banExpires: timestamp('ban_expires'");
      expect(authSchema).toContain("impersonatedBy: text('impersonated_by')");
      expect(authSchema).toContain("pgTable('admin_audit_events'");
      expect(authSchema).toContain("references(() => users.id, { onDelete: 'restrict' })");
      expect(authSchema).toContain("metadata: jsonb('metadata')");

      const adminFeatureSource = files
        .filter((entry) => entry.path.includes("features/admin-users"))
        .map((entry) => entry.content)
        .join("\n");
      expect(paths).toContain("src/features/admin-users/index.tsx");
      expect(paths).not.toContain("src/app/admin/users/hooks/use-admin-users.ts");
      expect(adminFeatureSource).not.toContain("authClient.admin");
      expect(adminFeatureSource).not.toContain("useEffect(");

      const client = read(files, "src/lib/orpc.ts");
      expect(client).toContain("export const orpcClient");
      expect(client).toContain("createORPCReactQueryUtils(orpcClient)");
      const handlerPath =
        framework === "nextjs"
          ? "src/app/api/rpc/[...path]/route.ts"
          : "src/server/http/rpc.server.ts";
      expect(read(files, handlerPath)).toMatch(/prefix: ["']\/api\/rpc["']/);
    });

    test(`${framework}/convex exposes the same admin oRPC contract through native Convex adapters`, () => {
      const files = generate(framework, "convex");
      const paths = files.map((entry) => entry.path);
      for (const path of adminApiPaths) expect(paths).toContain(path);

      expect(read(files, "src/server/api/contract.ts")).toContain("adminUsers");
      expect(read(files, "src/server/api/router.ts")).toContain("adminUsers");
      const context = read(files, "src/server/api/context.ts");
      expect(context).toContain("createRequestApplicationForRequest(headers)");
      expect(context).toContain("id: userId");
      expect(context).toContain("identityId: principal.identityUserId");
      expect(context).toContain("emailVerified: boolean;");
      expect(context).toContain("emailVerified: principal.emailVerified");
      expect(context).not.toContain("auth.handler(");

      const composition = read(files, "src/server/services/application/composition/admin.ts");
      expect(composition).toContain("fetchAuthQuery(api.users.list");
      expect(composition).toContain("fetchAuthMutation(api.users.setRoleByAuthId");
      expect(composition).toContain("fetchAuthMutation(api.users.setBannedByAuthId");

      const convexUsers = read(files, "convex/users.ts");
      expect(convexUsers).toContain("export const list");
      expect(convexUsers).toContain("export const setRoleByAuthId");
      expect(convexUsers).toContain("export const setBannedByAuthId");
      expect(paths).not.toContain("src/server/services/admin/better-auth-adapter.ts");
      expect(paths).toContain("src/features/admin-users/index.tsx");
      expect(paths).not.toContain("src/components/admin-guard.tsx");
      const adminFeatureSource = files
        .filter((entry) => entry.path.includes("features/admin-users"))
        .map((entry) => entry.content)
        .join("\n");
      expect(adminFeatureSource).not.toContain("useEffect(");
    });
  }

  test("single billing procedures resolve the generic rate-limit export", () => {
    const targets = [
      { framework: "nextjs" as const, apps: ["web"] },
      { framework: "tanstack-start" as const, apps: ["web"] },
    ];
    for (const { framework, apps } of targets) {
      for (const database of ["postgres", "convex"] as const) {
        const files = generate(framework, database, { apps, billing: ["stripe"] });
        const paths = files.map((entry) => entry.path);
        const rateLimitPath = "src/server/services/application/rate-limit.ts";
        expect(paths).toContain(rateLimitPath);

        const rateLimit = read(files, rateLimitPath);
        expect(rateLimit).toContain(
          "export async function rateLimit(key: string, limit = 60, windowMs = 60_000): Promise<void>",
        );
        const facade = read(files, "src/server/services/application/facade.ts");
        expect(facade).toContain('dependencies.rateLimit("billing:checkout:"');
        expect(facade).toContain('dependencies.rateLimit("billing:payment-link:"');

        for (const procedurePath of [
          "src/server/api/procedures/billing/create-checkout.ts",
          "src/server/api/procedures/billing/create-payment-link.ts",
        ] as const) {
          expect(paths).toContain(procedurePath);
          const procedure = read(files, procedurePath);
          expect(procedure).toContain("context.application.billing.");
          expect(procedure).not.toContain("rateLimit(");
        }
      }
    }
  });

  test("omits admin transport and services when auth and API are disabled", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generate(framework, "postgres", {
        preset: "custom",
        auth: false,
        api: false,
        email: false,
        analytics: false,
      });
      const paths = files.map((entry) => entry.path);
      for (const path of adminApiPaths) expect(paths).not.toContain(path);
      expect(paths.some((path) => path.startsWith("src/server/services/admin/"))).toBe(false);
      expect(paths).not.toContain("src/lib/orpc.ts");
    }
  });

  test("omits Postgres and database-none admin UI without a supported admin transport", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "none"] as const) {
        const files = generate(framework, database, {
          preset: "custom",
          auth: true,
          api: false,
          email: false,
          analytics: false,
        });
        const paths = files.map((entry) => entry.path);
        expect(paths.some((path) => path.includes("features/admin-users"))).toBe(false);
        expect(paths.some((path) => path.startsWith("src/app/admin/"))).toBe(false);
        expect(paths.some((path) => path.startsWith("src/routes/admin"))).toBe(false);
      }
    }
  });
});
