import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  desktopApiContractContent,
  desktopAuthContent,
} from "../../src/templates/apps/desktop/index.js";
import { authRouteBoundaryCode } from "../../src/templates/apps/fragments/api/auth-boundary.js";

type BoundaryFunctions = {
  normalizedAuthPath(request: Request): string | null;
  rejectDirectPrivilegedAuthRequest(request: Request): Response | null;
};

function config(partial: Partial<ProjectConfig> = {}): ProjectConfig {
  return projectConfigSchema.parse({
    name: "admin-boundary",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    database: "postgres",
    preset: "saas",
    billing: [],
    features: [],
    apps: ["web"],
    ...partial,
  });
}

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const match = files.find((file) => file.path === path);
  if (!match) throw new Error(`Missing generated file: ${path}`);
  return match.content;
}

function boundaryFunctions(): BoundaryFunctions {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const executableBoundary = transpiler.transformSync(authRouteBoundaryCode(false));
  const factory = new Function(
    `${executableBoundary}\nreturn { normalizedAuthPath, rejectDirectPrivilegedAuthRequest };`,
  ) as () => BoundaryFunctions;
  return factory();
}

describe("generated privileged auth mutation boundary", () => {
  test("denies direct admin and organization mutations while preserving identity and safe reads", () => {
    const boundary = boundaryFunctions();

    const blockedPaths = [
      "/api/auth/admin",
      "/api/auth/admin/create-user",
      "/api/auth/admin/set-role",
      "/api/auth/admin/ban-user",
      "/api/auth/%2561dmin/remove-user",
      "/api/auth/organization",
      "/api/auth/organization/create",
      "/api/auth/organization/update",
      "/api/auth/organization/delete",
      "/api/auth/organization/set-active",
      "/api/auth/organization/invite-member",
      "/api/auth/organization/accept-invitation",
      "/api/auth/organization/reject-invitation",
      "/api/auth/organization/cancel-invitation",
      "/api/auth/organization/add-member",
      "/api/auth/organization/remove-member",
      "/api/auth/organization/update-member-role",
      "/api/auth/organization/leave",
      "/api/auth/organization/create-team",
      "/api/auth/organization/update-team",
      "/api/auth/organization/remove-team",
      "/api/auth/organization/set-active-team",
      "/api/auth/organization/add-team-member",
      "/api/auth/organization/remove-team-member",
      "/api/auth/organization/create-role",
      "/api/auth/organization/update-role",
      "/api/auth/organization/delete-role",
      "/api/auth/organization/future-mutation",
      "/api/auth/%256frganization/create",
      "/api/auth/organization%252fdelete",
      "/api/auth/organization%255cset-active",
      "/api/auth/ORGANIZATION/%2569nvite-member",
    ] as const;

    for (const path of blockedPaths) {
      const response = boundary.rejectDirectPrivilegedAuthRequest(
        new Request(`https://example.test${path}`, { method: "POST" }),
      );
      expect(response?.status, path).toBe(404);
      expect(response?.headers.get("cache-control"), path).toBe(
        "private, no-cache, no-store, max-age=0, must-revalidate",
      );
    }

    const safeOrganizationReads = [
      "check-slug",
      "get-active-member",
      "get-active-member-role",
      "get-full-organization",
      "get-invitation",
      "get-role",
      "has-permission",
      "list",
      "list-invitations",
      "list-members",
      "list-roles",
      "list-team-members",
      "list-teams",
      "list-user-invitations",
      "list-user-teams",
    ] as const;

    for (const endpoint of safeOrganizationReads) {
      const path = `/api/auth/organization/${endpoint}`;
      expect(
        boundary.rejectDirectPrivilegedAuthRequest(
          new Request(`https://example.test${path}`, { method: "POST" }),
        ),
        path,
      ).toBeNull();
    }

    for (const [method, path] of [
      ["POST", "/api/auth/sign-in/email"],
      ["POST", "/api/auth/sign-in/social"],
      ["POST", "/api/auth/sign-up/email"],
      ["GET", "/api/auth/get-session"],
      ["POST", "/api/auth/two-factor/verify-totp"],
      ["POST", "/api/auth/two-factor/send-otp"],
    ] as const) {
      expect(
        boundary.rejectDirectPrivilegedAuthRequest(
          new Request(`https://example.test${path}`, { method }),
        ),
        path,
      ).toBeNull();
    }

    expect(
      boundary.rejectDirectPrivilegedAuthRequest(
        new Request("https://example.test/api/auth/%256frganization/list-members"),
      ),
    ).toBeNull();
  });

  test("installs the guard before every auth handler and keeps TanStack routes thin", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const label = `${mode}/${framework}/${database}`;
          const files = generateProjectFiles(config({ mode, framework, database }));
          const path =
            mode === "monorepo"
              ? framework === "nextjs"
                ? "apps/web/src/app/api/auth/[...all]/route.ts"
                : "apps/web/src/routes/api/auth/$.ts"
              : framework === "nextjs"
                ? "src/app/api/auth/[...all]/route.ts"
                : "src/routes/api/auth/$.ts";
          const route = content(files, path);
          const guardedHandler =
            framework === "tanstack-start"
              ? content(
                  files,
                  mode === "monorepo"
                    ? "apps/web/src/server/http/auth.server.ts"
                    : "src/server/http/auth.server.ts",
                )
              : route;

          if (framework === "tanstack-start") {
            expect(route, label).toContain(
              'import { createServerOnlyFn } from "@tanstack/react-start"',
            );
            expect(route, label).toMatch(
              /const dispatchAuthRequest = createServerOnlyFn\(async \(request: Request\): Promise<Response> => \{\s*const \{ handleAuthRequest \} = await import\("@\/server\/http\/auth\.server"\);\s*return await handleAuthRequest\(request\);\s*\}\);/,
            );
            expect(route.match(/dispatchAuthRequest\(request\)/g) ?? [], label).toHaveLength(5);
            expect(route, label).not.toContain(
              '(await import("@/server/http/auth.server")).handleAuthRequest(request)',
            );
            expect(route, label).not.toContain("rejectDirectPrivilegedAuthRequest");
            expect(route, label).not.toContain("auth.handler(request)");
            expect(guardedHandler, label).toContain('import "server-only"');
            expect(guardedHandler, label).toContain(
              mode === "monorepo"
                ? 'import { auth } from "@repo/auth"'
                : 'import { auth } from "@/server/auth"',
            );
          }

          const rejection = guardedHandler.indexOf(
            "const directPrivilegedRejection = rejectDirectPrivilegedAuthRequest(request)",
          );
          const preparation = guardedHandler.indexOf("prepareAuthRequestForRuntime(request)");
          const delegation = guardedHandler.indexOf("auth.handler(preparedAuthRequest.request)");

          expect(rejection, label).toBeGreaterThan(-1);
          expect(preparation, label).toBeGreaterThan(rejection);
          expect(delegation, label).toBeGreaterThan(preparation);
          expect(guardedHandler, label).toContain('pathname.startsWith("/api/auth/admin/")');
          expect(guardedHandler, label).toContain('pathname.startsWith("/api/auth/organization/")');
          expect(guardedHandler, label).toContain('"/api/auth/organization/list-members"');

          if (database === "postgres") {
            const authSources = files
              .filter(({ path: candidate }) =>
                mode === "monorepo"
                  ? candidate.startsWith("packages/auth/src/")
                  : candidate.startsWith("src/server/auth/"),
              )
              .map(({ content: source }) => source)
              .join("\n");
            expect(authSources, label).toContain("admin(");
            expect(authSources, label).toContain("organization(");
          }
        }
      }
    }
  });

  test("routes desktop admin operations through the typed audited oRPC service", () => {
    for (const database of ["postgres", "convex"] as const) {
      const files = generateProjectFiles(config({ database, apps: ["web", "desktop"] }));
      const users = content(files, "apps/desktop/src/renderer/routes/admin.users.tsx");
      const create = content(files, "apps/desktop/src/renderer/routes/admin.users.create.tsx");
      const auth = content(files, "apps/desktop/src/renderer/lib/auth.ts");

      expect(users, database).toContain("orpc.adminUsers.list.queryOptions");
      expect(users, database).toContain("orpc.adminUsers.changeRole.mutationOptions");
      expect(users, database).toContain("orpc.adminUsers.setBanned.mutationOptions");
      expect(create, database).toContain("orpc.adminUsers.create.mutationOptions");
      expect(`${users}\n${create}`, database).not.toContain("authClient.admin");
      expect(`${users}\n${create}`, database).not.toContain("api.users.setRoleByAuthId");
      expect(`${users}\n${create}`, database).not.toContain("api.users.setBannedByAuthId");
      expect(auth, database).not.toContain("adminClient");

      const procedure = content(files, "packages/api/src/procedures/admin/create-user.ts");
      expect(procedure, database).toContain("context.application.admin.createUser(input)");
      expect(procedure, database).not.toContain("createAdminServiceForRequest");
      const applicationServer = content(files, "packages/services/src/application/server.ts");
      expect(applicationServer, database).toContain("admin: createAdminServiceForRequest(headers)");
    }

    const contract = desktopApiContractContent(false, true, true);
    expect(contract).toContain("adminUsers:");
    expect(contract).toContain('.route({ method: "POST", path: "/admin/users" })');
    expect(desktopApiContractContent(false, true, false)).not.toContain("adminUsers:");
    expect(desktopAuthContent(true, true)).not.toContain("adminClient");
  });

  test("keeps Convex desktop admin session gating behind the typed me transport", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generateProjectFiles(
        config({ framework, database: "convex", apps: ["web", "desktop"] }),
      );
      const adminRoutes = [
        "apps/desktop/src/renderer/routes/admin.tsx",
        "apps/desktop/src/renderer/routes/admin.users.tsx",
        "apps/desktop/src/renderer/routes/admin.users.create.tsx",
      ].map((path) => content(files, path));
      const joined = adminRoutes.join("\n");

      for (const route of adminRoutes) {
        expect(route, framework).toContain("desktopQueryOptions.me()");
      }
      expect(joined.match(/desktopQueryOptions\.me\(\)/g), framework).toHaveLength(3);
      expect(joined, framework).not.toContain("convex/react");
      expect(joined, framework).not.toContain("convex/_generated/api");
      expect(joined, framework).not.toContain("api.users.me");
      expect(joined, framework).not.toContain("useConvexQuery");

      const me = content(files, "packages/api/src/procedures/me.ts");
      const facade = content(files, "packages/services/src/application/facade.ts");
      const applicationServer = content(files, "packages/services/src/application/server.ts");
      expect(me, framework).toContain("role: z.string().nullable()");
      expect(me, framework).toContain("banned: z.boolean()");
      expect(me, framework).toContain("context.application.me()");
      expect(me, framework).not.toContain("user.role");
      expect(facade, framework).toContain("role: principal.role");
      expect(facade, framework).toContain("banned: principal.banned");
      expect(applicationServer, framework).toContain("actor.authId !== session.user.id");
      expect(applicationServer, framework).toContain("if (!identity) return null");
    }
  });

  test("keeps the Convex auth client on framework-prefixed public configuration", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generateProjectFiles(config({ framework, database: "convex" }));
      const client = content(files, "packages/auth/src/client.ts");

      if (framework === "nextjs") {
        expect(client).toContain('import { env } from "@repo/config/next"');
        expect(client).toContain("env.NEXT_PUBLIC_APP_URL");
      } else {
        expect(client).toContain('import { env } from "@repo/config/vite"');
        expect(client).toContain("env.VITE_APP_URL");
      }
      expect(client).not.toContain("process.env");
      expect(client).not.toContain("import.meta.env");
      for (const serverKey of [
        "CONVEX_SITE_URL",
        "SITE_URL",
        "NEXT_PUBLIC_CONVEX_SITE_URL",
        "VITE_CONVEX_SITE_URL",
      ]) {
        expect(client, `${framework}/${serverKey}`).not.toContain(serverKey);
      }
      expect(client, framework).not.toContain("typeof process");
      expect(client, framework).not.toMatch(/\bas\s+(?:unknown|never|Record|any)\b/);
      expect(client, framework).not.toMatch(/\bany\b/);
    }
  });
});
