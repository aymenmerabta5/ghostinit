// @allow-long 380: one single-mode contract keeps capability, auth, session, and generated-browser plan invariants together
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
  test("documents the measured clean-Windows browser bound", () => {
    const plan = readFileSync(
      resolve(
        import.meta.dir,
        "../../docs/superpowers/plans/2026-08-23-ghostinit-v2-generated-gate-stabilization.md",
      ),
      "utf8",
    );
    const browserCommands = [
      ...plan.matchAll(
        /bun test tests\/integration\/generated-web-primitives\.test\.ts --timeout (\d+)/g,
      ),
    ];
    expect(browserCommands).toHaveLength(3);
    expect(browserCommands.map((match) => match[1])).toEqual(["900000", "900000", "900000"]);
    expect(plan).toContain("parallel installs");
    expect(plan).toContain("verified cleanup");
    expect(plan).toContain("readiness remains 120000ms");
  });

  test("uses local typed env for flags", () => {
    const server = read("src/lib/feature-flags.ts");
    const client = read("src/lib/feature-flags-client.ts");
    expect(server).toContain('from "@/lib/env"');
    expect(server).toContain('env.ANALYTICS_DISABLED !== "true"');
    expect(client).toContain('from "@/lib/env"');
    expect(client).toContain('env.NEXT_PUBLIC_ANALYTICS_DISABLED !== "true"');
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
    expect(client).toContain('env.VITE_ANALYTICS_DISABLED !== "true"');
    expect(client).not.toContain("NEXT_PUBLIC_ANALYTICS_DISABLED");

    const manifest = JSON.parse(
      tanstackFiles.find(({ path }) => path === "package.json")?.content ?? "{}",
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies?.["@t3-oss/env-core"]).toBeDefined();
    expect(manifest.dependencies?.["@t3-oss/env-nextjs"]).toBeUndefined();
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
      tanstackFiles.find(({ path }) => path === "src/routes/$notFound.tsx")?.content ?? "";
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
      const disabledSource = disabled.map(({ content }) => content).join("\n");
      const enabledSource = enabled.map(({ content }) => content).join("\n");
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

  test("derives auth and API requirements for independent capability selections", () => {
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
          expect(paths, key).toContain("src/server/auth/index.ts");
          expect(paths, key).toContain("src/lib/auth-client.ts");
          expect(paths, key).toContain("src/server/api/index.ts");
          expect(paths, key).toContain("src/lib/orpc.ts");
          expect(manifest.dependencies?.["@orpc/server"], key).toBeDefined();
          expect(manifest.dependencies?.["better-auth"], key).toBeDefined();
          if (capabilityCase.billing.length > 0) {
            const route =
              framework === "nextjs"
                ? "src/app/api/billing/subscriptions/route.ts"
                : "src/routes/api/billing/subscriptions.ts";
            expect(paths, key).toContain(route);
            if (database === "convex") {
              expect(
                generated.find(({ path }) => path === route)?.content ?? "",
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

  test("uses Better Auth 1.6.23 inferred contracts without type escapes", () => {
    const affectedPaths = [
      "src/components/ui/form.tsx",
      "src/app/sign-in/page.tsx",
      "src/app/forgot-password/page.tsx",
      "src/app/reset-password/page.tsx",
      "src/app/2fa/page.tsx",
      "src/app/settings/components/profile-card.tsx",
      "src/app/settings/components/two-factor-card.tsx",
      "src/app/admin/users/hooks/use-admin-users.ts",
      "src/app/admin/users/components/user-row.tsx",
      "src/app/admin/users/create/page.tsx",
      "src/lib/kernel.ts",
    ];
    const owned = files
      .filter(({ path }) => affectedPaths.includes(path))
      .map(({ content }) => content)
      .join("\n");
    expect(owned).not.toMatch(/\bas unknown as\b|:\s*any\b|@ts-ignore/);
    expect(read("src/app/forgot-password/page.tsx")).toContain("authClient.requestPasswordReset");
    expect(read("src/app/sign-in/page.tsx")).toContain("context.data.twoFactorRedirect");
    expect(read("src/app/settings/components/two-factor-card.tsx")).toContain(
      "result.data.totpURI",
    );
    expect(read("src/app/settings/components/two-factor-card.tsx")).toContain(
      "result.data.backupCodes",
    );
  });

  test("owns a closed role union and uses the local Select", () => {
    const kernel = read("src/lib/kernel.ts");
    expect(kernel).toContain('export const USER_ROLES = ["user", "admin"] as const');
    expect(kernel).toContain("export type UserRole = (typeof USER_ROLES)[number]");
    expect(kernel).toContain("export interface AdminUser");
    expect(read("src/app/admin/users/components/user-row.tsx")).toContain('from "@/lib/kernel"');
    const create = read("src/app/admin/users/create/page.tsx");
    expect(create).toContain("<Select items={ROLE_OPTIONS}");
    expect(create).not.toContain("<select");

    const monorepoFiles = generateProjectFiles(
      projectConfigSchema.parse({ ...filesConfig, mode: "monorepo" }),
    );
    const readMonorepo = (path: string): string =>
      monorepoFiles.find((file) => file.path === path)?.content ?? "";
    const monorepoKernel = readMonorepo("packages/kernel/src/admin.ts");
    expect(monorepoKernel).toContain('export const USER_ROLES = ["user", "admin"] as const');
    expect(monorepoKernel).toContain("role: UserRole");
    expect(readMonorepo("packages/kernel/src/index.ts")).toContain("UserRole");
    const monorepoHook = readMonorepo("apps/web/src/app/admin/users/hooks/use-admin-users.ts");
    expect(monorepoHook).toContain('isUserRole(user.role) ? user.role : "user"');
    expect(monorepoHook).toContain("currentRole: UserRole");
    expect(monorepoHook).not.toContain("as unknown as");
    expect(readMonorepo("apps/web/src/app/admin/users/components/user-row.tsx")).toContain(
      'from "@repo/kernel"',
    );
  });

  test("uses inferred Better Auth server sessions in every TanStack admin variant", () => {
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
      const admin = ["admin.tsx", "admin.users.tsx", "admin.users.create.tsx"]
        .map(
          (relativePath) =>
            generated.find(({ path }) => path === `${variant.root}/routes/${relativePath}`)
              ?.content ?? "",
        )
        .join("\n");
      expect(admin, key).toContain("const headers = getRequestHeaders()");
      expect(admin, key).toContain("auth.api.getSession({ headers })");
      expect(admin, key).not.toMatch(
        /\bas unknown as\b|Route\.useRouteContext\(\) as|session\.user as/,
      );

      if (variant.mode === "single") {
        const authServer =
          generated.find(({ path }) => path === "src/server/auth/index.ts")?.content ?? "";
        expect(authServer, key).not.toContain("as unknown as");
        if (variant.database === "convex") {
          expect(authServer, key).toContain("export interface SingleAuthSession");
          expect(authServer, key).toContain(
            "getSession: async ({ headers }: { headers: Headers }): Promise<SingleAuthSession | null>",
          );
        }
      }
    }
  });
});
