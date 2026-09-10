// @allow-long 540: one single-mode contract keeps capability, auth, session, admin, and generated-browser plan invariants together
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAddonInstallerMap, hasAddon } from "../../src/lib/addons.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const filesConfig = projectConfigSchema.parse({
  name: "demo",
  runtime: "bun",
  version: "0.1.0",
  mode: "single",
  billing: ["stripe"],
  features: [],
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
});
const files = generateProjectFiles(filesConfig);
const read = (path: string): string => files.find((file) => file.path === path)?.content ?? "";

describe("single Next boundary contracts", () => {
  test("keeps the generated browser gate bounded in executable source", () => {
    const generatedGate = readFileSync(
      resolve(import.meta.dir, "../../scripts/test-generated.ts"),
      "utf8",
    );
    const browserHarness = readFileSync(
      resolve(import.meta.dir, "../integration/generated-web-primitives.test.ts"),
      "utf8",
    );

    expect(generatedGate).toContain("const COMMAND_TIMEOUT_MS = 20 * 60 * 1000");
    expect(generatedGate).toContain("timeoutMs: options.timeoutMs ?? COMMAND_TIMEOUT_MS");
    expect(browserHarness).toContain(
      "waitForHttp200(`${target.url}/primitive-contract`, runningServer, 120_000)",
    );
    expect(browserHarness).toContain("terminateProcessTree(runningServer.child)");
    expect(browserHarness).toContain("cleanupError ??= error");
  });

  test("uses local typed env for flags", () => {
    const server = read("src/lib/feature-flags.ts");
    const client = read("src/lib/feature-flags-client.ts");
    expect(server).toContain('from "@/lib/env/server"');
    expect(server).toContain('env.ANALYTICS_DISABLED !== "true"');
    expect(client).toContain('from "@/lib/env/next"');
    expect(client).toContain('env.NEXT_PUBLIC_ANALYTICS_DISABLED !== "true"');
    expect(client).not.toContain('from "@/lib/env"');
    expect(client).not.toContain("@repo/config");
    expect(`${server}\n${client}`).not.toContain("as unknown as");
  });

  test("TanStack client flags use only the VITE public key", () => {
    const tanstackFiles = generateProjectFiles(
      projectConfigSchema.parse({
        ...filesConfig,
        framework: "tanstack-start",
      }),
    );
    const client =
      tanstackFiles.find(({ path }) => path === "src/lib/feature-flags-client.ts")?.content ?? "";
    expect(client).toContain('from "@/lib/env/vite"');
    expect(client).toContain('env.VITE_ANALYTICS_DISABLED !== "true"');
    expect(client).not.toContain("NEXT_PUBLIC_ANALYTICS_DISABLED");
    expect(client).not.toContain('from "@/lib/env"');
    expect(client).not.toContain("@repo/config");
    expect(client).not.toMatch(/\bprocess\.env\./);

    const manifest = JSON.parse(
      tanstackFiles.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["@t3-oss/env-core"]).toBeDefined();
    expect(manifest.dependencies?.["@t3-oss/env-nextjs"]).toBeDefined();
  });

  test("keeps database none distinct from cache and deploy none", () => {
    const addons = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "postgres",
      mode: "single",
      framework: "tanstack-start",
      apps: ["web"],
      preset: "saas",
      cache: "none",
      deploy: "none",
    });
    expect(hasAddon(addons, "database:postgres")).toBe(true);
    expect(hasAddon(addons, "database:none")).toBe(false);
    expect(hasAddon(addons, "none")).toBe(true);

    const tanstackFiles = generateProjectFiles(
      projectConfigSchema.parse({ ...filesConfig, framework: "tanstack-start" }),
    );
    const localEnv = tanstackFiles.find(({ path }) => path === ".env.local")?.content ?? "";
    expect(localEnv).toContain("POSTGRES_PASSWORD=");
    expect(localEnv).not.toContain("# Database disabled (--database none)");
    const viteConfig = tanstackFiles.find(({ path }) => path === "vite.config.ts")?.content ?? "";
    expect(viteConfig).toContain("from 'node:url'");
    expect(viteConfig).toContain("'@': fileURLToPath(new URL('./src', import.meta.url))");
    const notFound =
      tanstackFiles.find(({ path }) => path === "src/features/system/not-found.tsx")?.content ?? "";
    expect(notFound).toContain("import { Button } from '@/components/ui/button'");
    expect(notFound).toContain("render={<Link to='/' />}");
    expect(notFound).not.toContain("asChild");
  });

  test("auth sends the typed ResetPassword component", () => {
    const source = read("src/server/auth/index.ts");
    expect(source).toContain(
      'import ResetPasswordEmail from "@/server/email/templates/ResetPassword"',
    );
    expect(source).toContain("await sendEmail(user.email, subject, ResetPasswordEmail,");
    expect(source).not.toContain("forgotPasswordTemplate");
    expect(read("src/server/email/send.ts")).not.toContain("sendEmailHtml");
  });

  test("does not emit unused Motion output or workspace aliases", () => {
    expect(read("src/lib/animations.ts")).toBe("");
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.values(manifest.dependencies ?? {})).not.toContain("workspace:*");
    expect(Object.values(manifest.devDependencies ?? {})).not.toContain("workspace:*");
  });

  test("composes API and analytics only when their capabilities are enabled", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const disabled = generateProjectFiles(
        projectConfigSchema.parse({
          ...filesConfig,
          framework,
          preset: "custom",
          auth: false,
          api: false,
          email: false,
          analytics: false,
          billing: [],
        }),
      );
      const enabled = generateProjectFiles(
        projectConfigSchema.parse({
          ...filesConfig,
          framework,
          preset: "custom",
          auth: false,
          api: true,
          email: false,
          analytics: true,
          billing: [],
        }),
      );
      const disabledPaths = disabled.map(({ path }) => path);
      const enabledPaths = enabled.map(({ path }) => path);
      const dependencyBearingSource = (files: typeof disabled): string =>
        files
          .filter(
            ({ path }) =>
              path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith("package.json"),
          )
          .map(({ content }) => content)
          .join("\n");
      const disabledSource = dependencyBearingSource(disabled);
      const enabledSource = dependencyBearingSource(enabled);
      const disabledManifest = JSON.parse(
        disabled.find(({ path }) => path === "package.json")?.content ?? "{}",
      ) as { dependencies?: Record<string, string> };

      expect(disabledPaths.some((path) => path.startsWith("src/server/api/"))).toBe(false);
      expect(disabledPaths.some((path) => path.includes("/api/"))).toBe(false);
      expect(disabledPaths).not.toContain("src/lib/orpc.ts");
      expect(disabledPaths.some((path) => path.includes("analytics"))).toBe(false);
      expect(disabledSource).not.toContain("PostHogProvider");
      expect(disabledSource).not.toContain("@orpc/");
      expect(disabledManifest.dependencies?.["@orpc/server"]).toBeUndefined();
      expect(disabledManifest.dependencies?.["posthog-js"]).toBeUndefined();
      expect(enabledPaths.some((path) => path.startsWith("src/server/api/"))).toBe(true);
      expect(enabledPaths.some((path) => path.includes("analytics"))).toBe(true);
      expect(enabledSource).toContain("@orpc/");
      expect(enabledSource).toContain("PostHogProvider");
      const enabledProvider =
        enabled.find(({ path }) => path === "src/components/providers.tsx")?.content ?? "";
      expect(enabledProvider).toContain("PostHogProvider");
      expect(enabledProvider).toContain("<PostHogProvider>");
      const disabledProvider =
        disabled.find(({ path }) => path === "src/components/providers.tsx")?.content ?? "";
      expect(disabledProvider).not.toContain("PostHogProvider");
    }
  });

  test("does not emit nested package boundaries in any single framework", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const generated = generateProjectFiles(
        projectConfigSchema.parse({ ...filesConfig, framework }),
      );
      expect(
        generated.filter(({ path }) => path.endsWith("package.json")).map(({ path }) => path),
      ).toEqual(["package.json"]);
      expect(generated.map(({ content }) => content).join("\n")).not.toContain("workspace:*");
    }
  });

  test("keeps transport authless while deriving auth for billing", () => {
    const cases = [
      { key: "api-on-auth-off", auth: false, api: true, billing: [] as string[] },
      { key: "billing-on-api-off", auth: false, api: false, billing: ["stripe"] },
    ];
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        for (const capabilityCase of cases) {
          const generated = generateProjectFiles(
            projectConfigSchema.parse({
              ...filesConfig,
              framework,
              database,
              preset: "custom",
              auth: capabilityCase.auth,
              api: capabilityCase.api,
              email: false,
              analytics: false,
              billing: capabilityCase.billing,
            }),
          );
          const key = `${framework}/${database}/${capabilityCase.key}`;
          const paths = generated.map(({ path }) => path);
          const manifest = JSON.parse(
            generated.find(({ path }) => path === "package.json")?.content ?? "{}",
          ) as { dependencies?: Record<string, string> };
          expect(paths, key).toContain("src/server/api/index.ts");
          expect(paths, key).toContain("src/lib/orpc.ts");
          expect(manifest.dependencies?.["@orpc/server"], key).toBeDefined();
          const expectsAuth = capabilityCase.billing.length > 0;
          expect(paths.includes("src/server/auth/index.ts"), key).toBe(expectsAuth);
          expect(paths.includes("src/lib/auth-client.ts"), key).toBe(expectsAuth);
          expect(Boolean(manifest.dependencies?.["better-auth"]), key).toBe(expectsAuth);
          if (capabilityCase.billing.length > 0) {
            const procedure = "src/server/api/procedures/billing/subscriptions.ts";
            expect(paths, key).toContain(procedure);
            expect(
              paths.filter((path) =>
                /(?:app|routes)\/api\/billing\/(?:subscriptions|checkout|portal|payment-link)(?:\/route)?\.ts$/.test(
                  path,
                ),
              ),
              key,
            ).toEqual([]);
            if (database === "convex") {
              expect(
                generated.find(({ path }) => path === procedure)?.content ?? "",
                key,
              ).not.toContain("drizzle-orm");
            }
          }
        }
      }
    }
  });

  test("preserves TanStack inference and composes pending state", () => {
    const form = read("src/components/ui/form.tsx");
    expect(form).toContain("interface FormController");
    expect(form).toContain("handleSubmit(): Promise<void>");
    expect(form).not.toContain("FormApi<");
    expect(form).not.toContain("isPending");
  });

  test("uses catalog-pinned Better Auth inferred contracts without type escapes", () => {
    const affectedPaths = [
      "src/components/ui/form.tsx",
      "src/app/sign-in/page.tsx",
      "src/components/auth/sign-in-form.tsx",
      "src/components/auth/sign-up-form.tsx",
      "src/app/forgot-password/page.tsx",
      "src/app/reset-password/page.tsx",
      "src/app/2fa/page.tsx",
      "src/features/settings/profile-card.tsx",
      "src/features/settings/two-factor-card.tsx",
      "src/features/settings/use-two-factor-settings.ts",
      "src/features/settings/components/profile-view.tsx",
      "src/features/settings/components/two-factor-view.tsx",
      "src/features/settings/queries.ts",
      "src/features/settings/mutations.ts",
      "src/features/settings/model.ts",
      "src/features/admin-users/schema.ts",
      "src/features/admin-users/types.ts",
      "src/features/admin-users/translations.ts",
      "src/features/admin-users/queries.ts",
      "src/features/admin-users/mutations.ts",
      "src/features/admin-users/use-admin-users.ts",
      "src/features/admin-users/components/filters.tsx",
      "src/features/admin-users/components/user-table.tsx",
      "src/features/admin-users/components/user-row.tsx",
      "src/features/admin-users/components/user-row-confirmation.tsx",
      "src/features/admin-users/components/user-results.tsx",
      "src/features/admin-users/components/create-user-form.tsx",
    ];
    const owned = files
      .filter(
        ({ path }) =>
          affectedPaths.includes(path) ||
          path.startsWith("src/features/auth/") ||
          path.startsWith("src/features/account-deletion/"),
      )
      .map(({ content }) => content)
      .join("\n");
    expect(owned).not.toMatch(/\bas unknown as\b|:\s*any\b|@ts-ignore/);
    expect(read("src/features/auth/mutations.ts")).toContain("identityClient.requestPasswordReset");
    expect(read("src/features/auth/use-sign-in-form.ts")).toContain("const data = result.data");
    expect(read("src/features/auth/use-sign-in-form.ts")).toContain('"twoFactorRedirect" in data');
    expect(read("src/features/settings/mutations.ts")).toContain("result.data.totpURI");
    expect(read("src/features/settings/mutations.ts")).toContain("result.data.backupCodes");
  });

  test("owns admin roles, validation, and fields inside the feature boundary", () => {
    for (const mode of ["single", "monorepo"] as const) {
      const generated = generateProjectFiles(projectConfigSchema.parse({ ...filesConfig, mode }));
      const root = mode === "single" ? "src" : "apps/web/src";
      const readGenerated = (path: string): string =>
        generated.find((file) => file.path === path)?.content ?? "";
      const featureRoot = `${root}/features/admin-users`;
      const schema = readGenerated(`${featureRoot}/schema.ts`);
      const types = readGenerated(`${featureRoot}/types.ts`);
      const createForm = readGenerated(`${featureRoot}/components/create-user-form.tsx`);
      const userRow = readGenerated(`${featureRoot}/components/user-row.tsx`);
      const paths = generated.map(({ path }) => path);

      expect(schema, mode).toContain('z.enum(["user", "admin"])');
      expect(schema, mode).toContain(
        "export function adminUsersFilterSchema(translate: AdminUsersTranslate)",
      );
      expect(schema, mode).toContain(
        "export function createAdminUserSchema(translate: AdminUsersTranslate)",
      );
      expect(schema, mode).toContain('translate("validation.searchTooLong")');
      expect(schema, mode).toContain('translate("validation.passwordTooShort")');
      expect(types, mode).toContain("identityId: string | null");
      expect(types, mode).toContain("role: AdminUserRole");
      expect(createForm, mode).toContain("<form.AppForm>");
      expect(createForm, mode).toContain("<form.AppField");
      expect(createForm, mode).toContain("<field.SelectField");
      expect(readGenerated(`${featureRoot}/use-create-admin-user.ts`), mode).toContain(
        "validators: { onSubmit: createAdminUserSchema(translate) }",
      );
      expect(createForm, mode).toContain('{ label: translate("roles.user"), value: "user" }');
      expect(createForm, mode).toContain('{ label: translate("roles.admin"), value: "admin" }');
      expect(createForm, mode).toContain("options={roleOptions}");
      expect(createForm, mode).not.toContain("<select");
      expect(userRow, mode).toContain('from "../use-admin-user-action"');
      expect(readGenerated(`${featureRoot}/use-admin-user-action.ts`), mode).toContain(
        'from "./types"',
      );
      expect(userRow, mode).not.toContain("@repo/kernel");
      expect(paths, mode).not.toContain(`${root}/app/admin/users/components/user-row.tsx`);
      expect(paths, mode).not.toContain(`${root}/app/admin/users/use-admin-users.ts`);
    }
  });

  test("keeps TanStack guards at the auth boundary and admin data behind oRPC", () => {
    const variants = [
      { mode: "monorepo" as const, database: "postgres" as const, root: "apps/web/src" },
      { mode: "monorepo" as const, database: "convex" as const, root: "apps/web/src" },
      { mode: "single" as const, database: "postgres" as const, root: "src" },
      { mode: "single" as const, database: "convex" as const, root: "src" },
    ];
    for (const variant of variants) {
      const generated = generateProjectFiles(
        projectConfigSchema.parse({
          ...filesConfig,
          mode: variant.mode,
          database: variant.database,
          framework: "tanstack-start",
        }),
      );
      const key = `${variant.mode}/${variant.database}`;
      const readGenerated = (relativePath: string): string =>
        generated.find(({ path }) => path === `${variant.root}/routes/${relativePath}`)?.content ??
        "";
      const adminGuard = readGenerated("admin.tsx");
      const settings = readGenerated("settings.tsx");
      const usersRoute = readGenerated("admin.users.tsx");
      const createRoute = readGenerated("admin.users.create.tsx");
      const guardedRoutes = `${adminGuard}\n${settings}`;

      expect(guardedRoutes, key).toContain("getRequestUser");
      expect(guardedRoutes, key).toContain(
        variant.database === "convex" ? "getRequestUser()" : "getRequestUser(getRequestHeaders())",
      );
      expect(adminGuard, key).not.toContain("auth.api.getSession");
      expect(guardedRoutes, key).not.toMatch(
        /\bas unknown as\b|Route\.useRouteContext\(\) as|session\.user as/,
      );
      expect(usersRoute, key).toContain('from "@/features/admin-users"');
      expect(usersRoute, key).toContain("<AdminUsersFeature");
      expect(createRoute, key).toContain("<AdminCreateUserFeature");
      expect(`${usersRoute}\n${createRoute}`, key).not.toMatch(
        /authClient\.admin\.(?:listUsers|setRole|banUser|unbanUser)/,
      );
      if (variant.database === "convex") {
        expect(guardedRoutes, key).not.toContain("getRequestHeaders");
      }
      expect(usersRoute, key).not.toContain("ensureQueryData");
      expect(usersRoute, key).not.toContain("auth.api.getSession");
      expect(usersRoute, key).not.toContain("createAdminService");
    }
  });

  test("exports a real request-user implementation from every auth server owner", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const generated = generateProjectFiles(
            projectConfigSchema.parse({ ...filesConfig, mode, framework, database }),
          );
          const path =
            mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts";
          const authServer = generated.find((file) => file.path === path)?.content ?? "";
          const key = `${mode}/${framework}/${database}`;
          expect(authServer, key).toContain("export async function getRequestUser");
          if (database === "postgres") {
            expect(authServer, key).toContain("auth.api.getSession({ headers })");
            expect(authServer, key).toContain("return session?.user ?? null");
          } else {
            expect(authServer, key).toContain(
              framework === "nextjs" ? "convexBetterAuthNextJs" : "convexBetterAuthReactStart",
            );
            expect(authServer, key).toContain(
              'import { api } from "../../../convex/_generated/api"',
            );
            expect(authServer, key).toContain("fetchAuthQuery(api.users.me, {})");
            expect(authServer, key).not.toContain("SingleAuthSession");
            expect(authServer, key).not.toContain("return null");
            if (framework === "nextjs") {
              expect(authServer, key).toContain(
                'import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server"',
              );
              expect(authServer, key).toContain(
                "export const preloadAuthQuery: PreloadAuthQuery = convexAuth.preloadAuthQuery",
              );
              expect(authServer, key).toContain(
                "export const fetchAuthQuery: FetchAuthQuery = convexAuth.fetchAuthQuery",
              );
              expect(authServer, key).toContain(
                "export const fetchAuthMutation: FetchAuthMutation = convexAuth.fetchAuthMutation",
              );
              expect(authServer, key).toContain(
                "export const fetchAuthAction: FetchAuthAction = convexAuth.fetchAuthAction",
              );
              expect(authServer, key).not.toContain('from "convex-helpers"');
            }
          }
        }
      }
    }
  });

  test("uses the same typed oRPC adapters for Postgres and Convex admin state", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          const generated = generateProjectFiles(
            projectConfigSchema.parse({ ...filesConfig, mode, framework, database }),
          );
          const root = mode === "monorepo" ? "apps/web/src" : "src";
          const featureRoot = `${root}/features/admin-users`;
          const readGenerated = (path: string): string =>
            generated.find((file) => file.path === path)?.content ?? "";
          const queries = readGenerated(`${featureRoot}/queries.ts`);
          const mutations = readGenerated(`${featureRoot}/mutations.ts`);
          const actionsPath = `${root}/app/admin/users/actions.ts`;
          const actions = readGenerated(actionsPath);
          const hook = readGenerated(`${featureRoot}/use-admin-users.ts`);
          const index = readGenerated(`${featureRoot}/index.tsx`);
          const presentation = [
            "components/filters.tsx",
            "components/user-table.tsx",
            "components/user-row.tsx",
            "components/user-row-confirmation.tsx",
            "components/user-results.tsx",
            "components/create-user-form.tsx",
          ]
            .map((relativePath) => readGenerated(`${featureRoot}/${relativePath}`))
            .join("\n");
          const featureSource = `${queries}\n${mutations}\n${actions}\n${hook}\n${index}\n${presentation}`;
          const paths = generated.map(({ path }) => path);
          const key = `${mode}/${framework}/${database}`;

          for (const relativePath of [
            "index.tsx",
            "schema.ts",
            "types.ts",
            "translations.ts",
            "queries.ts",
            "mutations.ts",
            "use-admin-users.ts",
            "components/filters.tsx",
            "components/user-table.tsx",
            "components/user-row.tsx",
            "components/user-row-confirmation.tsx",
            "components/user-results.tsx",
            "components/create-user-form.tsx",
          ]) {
            expect(paths, key).toContain(`${featureRoot}/${relativePath}`);
          }
          expect(hook, key).not.toContain("useEffect");
          expect(`${queries}\n${mutations}\n${hook}`, key).not.toMatch(/\bfetch\s*\(/);
          expect(presentation, key).not.toMatch(
            /@\/lib\/orpc|convex\/react|authClient|\buse(?:Query|Mutation)\s*\(/,
          );
          expect(featureSource, key).not.toMatch(
            /authClient\.admin\.(?:listUsers|setRole|banUser|unbanUser)/,
          );
          expect(queries, key).toContain("orpc.adminUsers.list.queryOptions({");
          expect(mutations, key).toContain("queryClient.invalidateQueries({");
          if (framework === "nextjs") {
            expect(queries, key).toContain('orpc.adminUsers.list.key({ type: "query" })');
            expect(paths, key).toContain(actionsPath);
            expect(actions, key).toMatch(/^["']use server["'];/);
            expect(actions, key).toContain("createRequestApplicationForRequest");
            expect(actions, key).toContain(".admin.createUser(parsed.data)");
            expect(actions, key).not.toMatch(/@orpc\/|@\/server\/api|createRouterClient/);
            expect(actions, key).toContain("safeParse(input)");
            expect(actions, key).toContain('revalidatePath("/admin/users")');
            expect(mutations, key).toContain("createAdminUserAction");
            expect(mutations, key).toContain("changeAdminUserRoleAction");
            expect(mutations, key).toContain("setAdminUserBannedAction");
            expect(mutations, key).toContain("queryKey: adminUsersQueryKey()");
            expect(featureSource, key).not.toContain("queryKey: [");
          } else {
            expect(paths, key).not.toContain(actionsPath);
            expect(mutations, key).toContain("orpc.adminUsers.create.mutationOptions({");
            expect(mutations, key).toContain("orpc.adminUsers.changeRole.mutationOptions({");
            expect(mutations, key).toContain("orpc.adminUsers.setBanned.mutationOptions({");
            expect(queries, key).toContain("adminUsersQueryKey(scope, input)");
            expect(queries, key).toContain('["auth", "anonymous", "admin-users"]');
            expect(mutations, key).toContain("currentQueryAuthScope");
          }
          expect(`${queries}\n${mutations}`, key).not.toContain("convex/react");
          expect(`${queries}\n${mutations}`, key).not.toContain("authClient.admin");
        }
      }
    }
  });

  test("routes desktop Convex admin products through the authenticated local user API", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const generated = generateProjectFiles(
          projectConfigSchema.parse({
            ...filesConfig,
            mode,
            database,
            apps: mode === "monorepo" ? ["web", "desktop"] : ["desktop"],
          }),
        );
        const root = mode === "monorepo" ? "apps/desktop/" : "";
        const readFeature = (name: string) =>
          generated.find(({ path }) => path === `${root}src/renderer/features/admin-users/${name}`)
            ?.content ?? "";
        const users = ["queries.ts", "mutations.ts", "screen.tsx"].map(readFeature).join("\n");
        const create = ["mutations.ts", "use-create-admin-user.ts", "create-screen.tsx"]
          .map(readFeature)
          .join("\n");
        const providers =
          generated.find(({ path }) => path === `${root}src/renderer/lib/providers.tsx`)?.content ??
          "";
        const auth =
          generated.find(({ path }) => path === `${root}src/renderer/lib/auth.ts`)?.content ?? "";
        const key = `${mode}/desktop/${database}`;
        expect(users, key).toContain("orpc.adminUsers.list.queryOptions");
        expect(users, key).toContain("orpc.adminUsers.changeRole.mutationOptions");
        expect(users, key).toContain("orpc.adminUsers.setBanned.mutationOptions");
        expect(create, key).toContain("orpc.adminUsers.create.mutationOptions");
        expect(`${users}\n${create}`, key).not.toContain("authClient.admin");
        expect(`${users}\n${create}`, key).not.toContain("api.users.setRoleByAuthId");
        expect(`${users}\n${create}`, key).not.toContain("api.users.setBannedByAuthId");
        expect(auth, key).not.toContain("adminClient");
        if (database === "convex") {
          expect(providers, key).toContain("ConvexProviderWithAuth");
          expect(providers, key).toContain("useAuth={useConvexBetterAuth}");
          expect(providers, key).not.toContain("ConvexBetterAuthProvider");
          expect(auth, key).toContain("convexClient()");
        }
      }
    }
  });
});
