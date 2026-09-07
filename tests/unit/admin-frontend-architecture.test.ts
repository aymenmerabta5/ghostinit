import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import type { AdminDatabase } from "../../src/templates/apps/fragments/admin/index.js";
import { pageFiles } from "../../src/templates/apps/pages.js";
import { tanstackPageFiles } from "../../src/templates/apps/tanstack-pages.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Framework = "next" | "tanstack";
type Mode = "monorepo" | "single";

function render(mode: Mode, framework: Framework, database: AdminDatabase): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "admin-frontend",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework: framework === "next" ? "nextjs" : "tanstack-start",
      database,
      billing: ["stripe"],
      features: [],
      apps: ["web"],
    }),
  );
}

function sourceRoot(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/src" : "src";
}

function read(files: readonly TemplateFile[], path: string): string {
  return files.find((entry) => entry.path === path)?.content ?? "";
}

describe("generated admin frontend architecture", () => {
  test("emits one feature contract for every web framework, mode, and database", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["next", "tanstack"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const files = render(mode, framework, database);
          const root = `${sourceRoot(mode)}/features/admin-users`;
          const expected = [
            "index.tsx",
            "schema.ts",
            "types.ts",
            "queries.ts",
            "mutations.ts",
            "hooks/use-admin-users.ts",
            "components/filters.tsx",
            "components/user-table.tsx",
            "components/user-results.tsx",
            "components/user-row.tsx",
            "components/user-row-confirmation.tsx",
            "components/create-user-form.tsx",
          ].map((path) => `${root}/${path}`);
          const paths = files.map((entry) => entry.path);
          for (const path of expected) expect(paths).toContain(path);

          const queries = read(files, `${root}/queries.ts`);
          const mutations = read(files, `${root}/mutations.ts`);
          const hook = read(files, `${root}/hooks/use-admin-users.ts`);
          const featureIndex = read(files, `${root}/index.tsx`);
          const filters = read(files, `${root}/components/filters.tsx`);
          const createForm = read(files, `${root}/components/create-user-form.tsx`);
          const presentation = [
            filters,
            createForm,
            read(files, `${root}/components/user-table.tsx`),
            read(files, `${root}/components/user-results.tsx`),
            read(files, `${root}/components/user-row.tsx`),
            read(files, `${root}/components/user-row-confirmation.tsx`),
          ].join("\n");

          for (const path of [
            `${root}/index.tsx`,
            `${root}/components/user-row.tsx`,
            `${root}/components/user-row-confirmation.tsx`,
            `${root}/components/user-results.tsx`,
          ]) {
            // Keep enough headroom for Oxfmt to expand dense generated JSX
            // while remaining below the executable 150-line standalone limit.
            expect(read(files, path).split(/\r?\n/).length, path).toBeLessThanOrEqual(120);
          }

          expect(hook).not.toContain("useEffect");
          expect(`${queries}\n${mutations}\n${hook}`).not.toMatch(/\bfetch\(/);
          expect(`${queries}\n${mutations}\n${hook}`).not.toContain("convex/react");
          expect(`${queries}\n${mutations}\n${hook}`).not.toContain("api.users.");
          expect(`${queries}\n${mutations}\n${hook}`).not.toContain("authClient.admin");
          if (framework === "next") {
            expect(`${queries}\n${mutations}\n${hook}`).not.toContain("queryKey: [");
          } else {
            expect(queries).toContain("adminUsersQueryKey");
          }
          expect(presentation).not.toContain("@/lib/orpc");
          expect(presentation).not.toContain("convex/react");
          expect(presentation).not.toContain("authClient");
          expect(presentation).not.toContain("useAdminUserMutations");
          expect(featureIndex).toContain("const mutations = useAdminUserMutations()");
          expect(featureIndex).toContain("<CreateUserForm");
          expect(`${presentation}\n${hook}`).not.toContain("as unknown as");
          expect(`${presentation}\n${hook}`).not.toContain("safeParse");
          expect(filters).toContain("<form.AppField");
          expect(createForm).toContain("<form.AppForm>");
          expect(createForm).toContain("<field.PasswordField");
          expect(createForm).toContain("<field.SelectField");
          expect(createForm).toContain("<form.Subscribe");
          expect(presentation).not.toContain("ml-");
          expect(presentation).not.toContain("mr-");
          expect(presentation).not.toContain("pl-");
          expect(presentation).not.toContain("pr-");
          expect(presentation).not.toContain("text-left");
          expect(presentation).not.toContain("text-right");

          expect(queries).toContain("orpc.adminUsers.list.queryOptions");
          if (framework === "next") {
            expect(queries).toContain('orpc.adminUsers.list.key({ type: "query" })');
            expect(mutations).toContain("createAdminUserAction");
            expect(mutations).toContain("changeAdminUserRoleAction");
            expect(mutations).toContain("setAdminUserBannedAction");
          } else {
            expect(queries).toContain("adminUsersQueryKey(scope, input)");
            expect(mutations).toContain("orpc.adminUsers.create.mutationOptions");
            expect(mutations).toContain("orpc.adminUsers.changeRole.mutationOptions");
            expect(mutations).toContain("orpc.adminUsers.setBanned.mutationOptions");
          }

          if (framework === "tanstack") {
            const route = read(files, `${sourceRoot(mode)}/routes/admin.users.tsx`);
            expect(route).toContain("<AdminUsersFeature />");
            expect(route).not.toContain("createAdminService");
            expect(route).not.toContain("convex/react");
          }
          if (framework === "next") {
            const page = read(files, `${sourceRoot(mode)}/app/admin/users/page.tsx`);
            expect(page).toContain("<AdminUsersFeature initialData={initialData} />");
            expect(page).not.toContain("createAdminService");
            expect(page).not.toContain("createBetterAuthAdminIdentityPort");
            expect(page).not.toContain('"use client"');
          }
        }
      }
    }
  });

  test("omits admin output when auth or the Postgres admin transport is unavailable", () => {
    const withoutAuth = pageFiles({
      auth: { inUse: false },
      api: { inUse: true },
      postgres: { inUse: true },
    });
    expect(withoutAuth.some((entry) => entry.path.includes("/admin"))).toBe(false);
    expect(withoutAuth.some((entry) => entry.path.includes("features/admin-users"))).toBe(false);

    const withoutTransport = tanstackPageFiles(true, false, true, false);
    expect(withoutTransport.some((entry) => entry.path.includes("/admin"))).toBe(false);
    expect(withoutTransport.some((entry) => entry.path.includes("features/admin-users"))).toBe(
      false,
    );

    const withoutDatabase = tanstackPageFiles(true, false, true, true, false);
    expect(withoutDatabase.some((entry) => entry.path.includes("/admin"))).toBe(false);
    expect(withoutDatabase.some((entry) => entry.path.includes("features/admin-users"))).toBe(
      false,
    );
  });
});
