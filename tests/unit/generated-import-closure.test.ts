import { describe, expect, test } from "bun:test";
import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

const config = (billing: ProjectConfig["billing"]): ProjectConfig =>
  projectConfigSchema.parse({
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing,
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
  });

const CLOSURE_MATRIX = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).flatMap((framework) =>
    (["postgres", "convex"] as const).flatMap((database) =>
      ([false, true] as const).map((enabled) => ({
        key: `${mode}/${framework}/${database}/${enabled ? "capabilities-on" : "capabilities-off"}`,
        config: projectConfigSchema.parse({
          name: "demo",
          mode,
          framework,
          database,
          preset: enabled ? "saas" : "custom",
          auth: enabled,
          api: enabled,
          email: enabled,
          analytics: enabled,
          billing: enabled ? ["stripe"] : [],
          features: enabled ? ["i18n"] : [],
          apps: ["web"],
        }),
      })),
    ),
  ),
);

const INDEPENDENT_CAPABILITY_MATRIX = (["monorepo", "single"] as const).flatMap((mode) =>
  (["nextjs", "tanstack-start"] as const).flatMap((framework) =>
    (["postgres", "convex"] as const).flatMap((database) =>
      [
        { key: "api-on-auth-off", auth: false, api: true, billing: [] as string[] },
        { key: "billing-on-api-off", auth: false, api: false, billing: ["stripe"] },
      ].map((input) => ({
        key: `${mode}/${framework}/${database}/${input.key}`,
        config: projectConfigSchema.parse({
          name: "demo",
          mode,
          framework,
          database,
          preset: "custom",
          auth: input.auth,
          api: input.api,
          email: false,
          analytics: false,
          billing: input.billing,
          apps: ["web"],
        }),
      })),
    ),
  ),
);

const INTERNAL_JOBS_MATRIX = (["monorepo", "single"] as const).flatMap((mode) =>
  (["postgres", "convex"] as const).map((database) => ({
    key: `${mode}/${database}/internal-jobs`,
    config: projectConfigSchema.parse({
      name: "demo",
      mode,
      framework: "nextjs",
      database,
      preset: "custom",
      auth: false,
      api: false,
      jobs: true,
      jobsUserFacingApi: false,
      email: false,
      analytics: false,
      billing: [],
      apps: ["web"],
    }),
  })),
);

const packageName = (specifier: string): string =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);

const MAINTAINED_CODE = /\.(?:[cm]?[jt]sx?)$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
function findUndeclaredImports(files: TemplateFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const owners = files
    .filter(
      (file) =>
        file.path === "package.json" ||
        /^(?:apps|packages|tooling)\/[^/]+\/package\.json$/.test(file.path),
    )
    .map((file) => {
      const root = file.path === "package.json" ? "" : file.path.slice(0, -"/package.json".length);
      const manifest = JSON.parse(file.content) as {
        name: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
      return {
        root,
        name: manifest.name,
        declarations: new Set([
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
          ...Object.keys(manifest.peerDependencies ?? {}),
          ...Object.keys(manifest.optionalDependencies ?? {}),
        ]),
      };
    })
    .sort((left, right) => right.root.length - left.root.length);

  const missing = new Set<string>();
  for (const file of files) {
    if (!MAINTAINED_CODE.test(file.path)) continue;
    const owner = owners.find(({ root }) => root === "" || file.path.startsWith(`${root}/`));
    if (!owner || !byPath.has(owner.root === "" ? "package.json" : `${owner.root}/package.json`))
      continue;
    const parsed = parseFile(file.content, extname(file.path));
    for (const specifier of parsed.imports) {
      if (specifier.startsWith(".") || BUILTINS.has(specifier) || specifier === "bun:test")
        continue;
      if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
        const packageSource = file.path.match(/^((?:apps|packages|tooling)\/[^/]+)\/src\//);
        const sourceRoot = file.path.startsWith("src/")
          ? "src"
          : packageSource
            ? `${packageSource[1]}/src`
            : undefined;
        const relativeTarget = specifier.slice(2).split("?")[0] ?? specifier.slice(2);
        const target = sourceRoot ? `${sourceRoot}/${relativeTarget}` : relativeTarget;
        const withoutJs = target.replace(/\.js$/, "");
        const candidates = [
          target,
          withoutJs,
          `${withoutJs}.ts`,
          `${withoutJs}.tsx`,
          `${withoutJs}.js`,
          `${withoutJs}.jsx`,
          `${withoutJs}.css`,
          `${withoutJs}/index.ts`,
          `${withoutJs}/index.tsx`,
        ];
        if (!sourceRoot || !candidates.some((candidate) => byPath.has(candidate))) {
          missing.add(`${owner.name} :: ${file.path} -> ${specifier}`);
        }
        continue;
      }
      const dependency = packageName(specifier);
      if (dependency !== owner.name && !owner.declarations.has(dependency)) {
        missing.add(`${owner.name} :: ${file.path} -> ${dependency}`);
      }
    }
  }
  return [...missing].toSorted();
}

describe("generated package ownership", () => {
  test("auth owns access control and kernel stays dependency-free", () => {
    const files = generateProjectFiles(config(["stripe"]));
    expect(files.some(({ path }) => path === "packages/auth/src/access.ts")).toBe(true);
    expect(files.some(({ path }) => path === "packages/kernel/src/access.ts")).toBe(false);
    expect(files.find(({ path }) => path === "packages/auth/src/server.ts")?.content).toContain(
      'admin({ ac, roles, adminRoles: ["admin", "superAdmin"] })',
    );
    expect(files.find(({ path }) => path === "packages/auth/src/client.ts")?.content).toContain(
      "adminClient({ ac, roles })",
    );
    expect(files.find(({ path }) => path === "packages/auth/src/index.ts")?.content).toContain(
      'export { auth, getRequestUser, type Auth } from "./server"',
    );
    expect(files.some(({ path }) => path === "apps/web/src/components/admin-guard.tsx")).toBe(
      false,
    );
    const adminLayout =
      files.find(({ path }) => path === "apps/web/src/app/admin/layout.tsx")?.content ?? "";
    expect(adminLayout).toContain('import { isAdminRole } from "@repo/auth/access"');
    expect(adminLayout).toContain(
      'if (!session?.user || !isAdminRole(session.user.role) || session.user.banned === true) redirect("/")',
    );
  });

  test("every maintained import is declared by its nearest root or workspace owner", () => {
    const problems = [
      ...CLOSURE_MATRIX,
      ...INDEPENDENT_CAPABILITY_MATRIX,
      ...INTERNAL_JOBS_MATRIX,
    ].flatMap(({ key, config }) =>
      findUndeclaredImports(generateProjectFiles(config)).map((problem) => `${key}: ${problem}`),
    );
    expect(problems).toEqual([]);
  });

  test("local alias imports fail closure when their emitted target is missing", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "demo",
        mode: "single",
        framework: "nextjs",
        database: "postgres",
        preset: "saas",
        billing: [],
        apps: ["web"],
      }),
    ).filter(({ path }) => path !== "src/lib/env/server.ts");
    expect(findUndeclaredImports(files)).toContain(
      "demo :: src/lib/feature-flags.ts -> @/lib/env/server",
    );
  });

  test("single mode has only its flat root package boundary", () => {
    for (const { key, config } of CLOSURE_MATRIX.filter(({ config }) => config.mode === "single")) {
      const files = generateProjectFiles(config);
      const manifests = files.filter(({ path }) => path.endsWith("package.json"));
      expect(
        manifests.map(({ path }) => path),
        key,
      ).toEqual(["package.json"]);
      for (const manifest of manifests) {
        expect(manifest.content, `${key}: ${manifest.path}`).not.toContain("workspace:*");
      }
    }
  });

  test("transport stays authless while billing derives both auth and API packages", () => {
    for (const { key, config } of INDEPENDENT_CAPABILITY_MATRIX) {
      const generated = generateProjectFiles(config);
      const paths = generated.map(({ path }) => path);
      const expectsAuth = config.billing.length > 0;
      if (config.mode === "monorepo") {
        expect(paths, key).toContain("packages/api/package.json");
        expect(paths.includes("packages/auth/package.json"), key).toBe(expectsAuth);
      } else {
        expect(paths, key).toContain("src/server/api/index.ts");
        expect(paths.includes("src/server/auth/index.ts"), key).toBe(expectsAuth);
      }
      const proxy = generated.find(
        ({ path }) => path.endsWith("/proxy.ts") || path === "src/proxy.ts",
      );
      if (!expectsAuth) expect(proxy?.content ?? "", key).not.toContain("better-auth");
    }
  });

  test("single mode keeps Better Auth default roles and its local admin predicate", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "demo",
        mode: "single",
        framework: "nextjs",
        database: "postgres",
        preset: "saas",
        billing: ["stripe"],
      }),
    );
    const server = files.find(({ path }) => path === "src/server/auth/index.ts")?.content ?? "";
    const client = files.find(({ path }) => path === "src/lib/auth-client.ts")?.content ?? "";
    const guard = files.find(({ path }) => path === "src/app/admin/layout.tsx")?.content ?? "";
    expect(server).toContain("admin()");
    expect(client).toContain("adminClient()");
    expect(server).not.toContain("adminRoles");
    expect(client).not.toContain("{ ac, roles }");
    expect(guard).toContain('import { isSingleAdminRole as isAdminRole } from "@/lib/access"');
    expect(guard).not.toContain("@repo/auth/access");
  });

  test("Convex auth rejects plugins absent from the stock component schema", () => {
    const monorepoFiles = generateProjectFiles(
      projectConfigSchema.parse({
        name: "demo",
        mode: "monorepo",
        framework: "nextjs",
        database: "convex",
        preset: "saas",
        billing: [],
      }),
    );
    const monorepoServer =
      monorepoFiles.find(({ path }) => path === "convex/auth.ts")?.content ?? "";
    const monorepoClient =
      monorepoFiles.find(({ path }) => path === "packages/auth/src/client.ts")?.content ?? "";
    expect(monorepoServer).toContain('selectedIdentityPlugins = ["two-factor"]');
    expect(monorepoServer).toContain(
      'rejectedIdentityPlugins = ["admin", "passkey", "organization"]',
    );
    expect(monorepoServer).toContain("accountLockout: { enabled: false }");
    expect(monorepoServer).not.toContain("@repo/auth/access");
    expect(monorepoServer).not.toContain("admin({");
    expect(monorepoClient).not.toContain("adminClient");
    expect(monorepoClient).not.toContain("organizationClient");

    const singleConfigurations = [
      { framework: "nextjs" as const, apps: ["web"] as const },
      { framework: "tanstack-start" as const, apps: ["web"] as const },
      { framework: "nextjs" as const, apps: ["mobile"] as const },
    ];
    for (const input of singleConfigurations) {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "demo",
          mode: "single",
          framework: input.framework,
          database: "convex",
          preset: "saas",
          billing: [],
          apps: input.apps,
        }),
      );
      const server = files.find(({ path }) => path === "convex/auth.ts")?.content ?? "";
      const client = files.find(({ path }) => path === "src/lib/auth-client.ts")?.content ?? "";
      expect(server).toContain('selectedIdentityPlugins = ["two-factor"]');
      expect(server).toContain("accountLockout: { enabled: false }");
      expect(server).not.toContain("admin({");
      expect(server).not.toContain("@repo/auth/access");
      expect(client).not.toContain("adminClient");
      expect(client).not.toContain("organizationClient");
    }
  });

  test("generated oRPC errors retain structured code and meta data", () => {
    const files = generateProjectFiles(config(["stripe"]));
    const middleware =
      files.find(({ path }) => path === "packages/api/src/middleware/auth.ts")?.content ?? "";
    const serviceErrors =
      files.find(({ path }) => path === "packages/api/src/utils/service-error.ts")?.content ?? "";
    expect(middleware).toContain('createCodedORPCError("FORBIDDEN", "ACCOUNT_SUSPENDED"');
    expect(serviceErrors).toContain("data: { code, ...(meta ? { meta } : {}) }");
    expect(serviceErrors).toContain("meta: error.meta");
    expect(serviceErrors).not.toContain("JSON.stringify");
    expect(serviceErrors).not.toContain("as unknown as");
  });

  test("billing-only declarations disappear with billing files", () => {
    const files = generateProjectFiles(config([]));
    for (const path of [
      "packages/api/package.json",
      "packages/modules/package.json",
      "packages/services/package.json",
    ]) {
      const manifest = JSON.parse(files.find((file) => file.path === path)?.content ?? "{}") as {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["@repo/billing"]).toBeUndefined();
    }
  });

  test("Convex subscription routes delegate to the authenticated request facade without Drizzle leakage", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "demo",
            mode,
            framework,
            database: "convex",
            preset: "saas",
            billing: ["stripe"],
            apps: ["web"],
          }),
        );
        const procedurePath =
          mode === "monorepo"
            ? "packages/api/src/procedures/billing/subscriptions.ts"
            : "src/server/api/procedures/billing/subscriptions.ts";
        const procedure = files.find(({ path }) => path === procedurePath)?.content ?? "";
        expect(procedure, `${mode}/${framework}`).toContain(
          "context.application.billing.subscriptions()",
        );
        expect(procedure).not.toContain("drizzle-orm");
        expect(procedure).not.toContain("db.select");
        expect(procedure).not.toContain("schema/billing");
        expect(
          files.some(({ path }) =>
            /(?:app|routes)\/api\/billing\/(?:subscriptions|checkout|portal|payment-link)(?:\/route)?\.ts$/.test(
              path,
            ),
          ),
        ).toBe(false);

        const webManifestPath = mode === "monorepo" ? "apps/web/package.json" : "package.json";
        const manifest = JSON.parse(
          files.find(({ path }) => path === webManifestPath)?.content ?? "{}",
        ) as { dependencies?: Record<string, string> };
        expect(manifest.dependencies?.["drizzle-orm"]).toBeUndefined();
        if (mode === "single") {
          expect(files.some(({ path }) => path.startsWith("src/server/db/schema/billing"))).toBe(
            false,
          );
        }
      }
    }
  });

  test("Convex subscription reads use the authenticated query wrapper and server mutations use the trusted action", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "demo",
            mode,
            framework,
            database: "convex",
            preset: "saas",
            billing: ["stripe"],
            apps: ["web"],
          }),
        );
        const adapterPath =
          mode === "monorepo"
            ? "packages/billing/src/adapters/convex.ts"
            : "src/server/billing/adapters/convex.ts";
        const adapter = files.find(({ path }) => path === adapterPath)?.content ?? "";
        const servicePath =
          mode === "monorepo"
            ? "packages/services/src/billing/list-subscriptions.service.ts"
            : "src/server/services/billing/list-subscriptions.service.ts";
        const service = files.find(({ path }) => path === servicePath)?.content ?? "";
        const snapshotRepositoryPath =
          mode === "monorepo"
            ? "packages/services/src/billing/billing-snapshot.repository.ts"
            : "src/server/services/billing/billing-snapshot.repository.ts";
        const snapshotRepository =
          files.find(({ path }) => path === snapshotRepositoryPath)?.content ?? "";

        expect(service).toContain("repository.findSnapshot(userId)");
        expect(snapshotRepository).toContain("fetchAuthQuery(api.billing.getBillingSnapshot, {})");
        expect(service).not.toContain("paginationOpts:");
        expect(service).not.toContain("userId,");
        expect(adapter).toContain("convexClient.action(api.billingServer.mutate");
        expect(adapter).toContain("trustedServerToken()");
        expect(adapter).not.toContain("convexClient.mutation(api.billing");
      }
    }
  });

  test("Convex billing uses an explicit barrel composer instead of marker slicing", () => {
    const generator = readFileSync(
      new URL("../../src/templates/billing-generator.ts", import.meta.url),
      "utf8",
    );
    expect(generator).not.toContain('indexOf("// Explicit re-exports from schema")');
    expect(generator).toContain("convexBillingIndexContent()");
  });
});
