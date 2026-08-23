import { describe, expect, test } from "bun:test";
import { builtinModules } from "node:module";
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

const packageName = (specifier: string): string =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : (specifier.split("/")[0] ?? specifier);

const MAINTAINED_CODE = /\.(?:[cm]?[jt]sx?)$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const TASK1_PACKAGE_OWNERS = new Set([
  "@repo/api",
  "@repo/auth",
  "@repo/email",
  "@repo/kernel",
  "@repo/modules",
  "@repo/services",
]);

function findUndeclaredImports(files: TemplateFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const owners = files
    .filter((file) => file.path === "package.json" || file.path.endsWith("/package.json"))
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
      if (
        specifier.startsWith(".") ||
        specifier.startsWith("@/") ||
        specifier.startsWith("~/") ||
        BUILTINS.has(specifier) ||
        specifier === "bun:test"
      )
        continue;
      const dependency = packageName(specifier);
      if (!owner.declarations.has(dependency)) {
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
      'export { auth, type Auth } from "./server"',
    );
    expect(
      files.find(({ path }) => path === "apps/web/src/components/admin-guard.tsx")?.content,
    ).toContain('import { isAdminRole } from "@repo/auth/access"');
    expect(
      files.find(({ path }) => path === "apps/web/src/app/admin/layout.tsx")?.content,
    ).toContain('if (!isAdminRole(session?.user?.role)) redirect("/")');
  });

  test("every Task 1-owned monorepo package import is declared by its nearest owner", () => {
    // Task 4 extends this same root-aware scanner to apps, root, Convex, configs,
    // scripts, and single mode after those owners' manifests are repaired.
    const problems = CLOSURE_MATRIX.filter(({ config }) => config.mode === "monorepo").flatMap(
      ({ key, config }) =>
        findUndeclaredImports(generateProjectFiles(config))
          .filter((problem) => TASK1_PACKAGE_OWNERS.has(problem.split(" :: ")[0] ?? ""))
          .map((problem) => `${key}: ${problem}`),
    );
    expect(problems).toEqual([]);
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
    const guard =
      files.find(({ path }) => path === "src/components/admin-guard.tsx")?.content ?? "";
    expect(server).toContain("admin()");
    expect(client).toContain("adminClient()");
    expect(server).not.toContain("adminRoles");
    expect(client).not.toContain("{ ac, roles }");
    expect(guard).toContain('import { isSingleAdminRole as isAdminRole } from "@/lib/access"');
    expect(guard).not.toContain("@repo/auth/access");
  });

  test("Convex server and client use the mode-specific access contract", () => {
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
    expect(monorepoServer).toContain('import { ac, roles } from "@repo/auth/access"');
    expect(monorepoServer).toContain('admin({ ac, roles, adminRoles: ["admin", "superAdmin"] })');
    expect(monorepoClient).toContain("adminClient({ ac, roles })");

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
      expect(server).toContain("admin()");
      expect(server).not.toContain("adminRoles");
      expect(server).not.toContain("@repo/auth/access");
      expect(client).toContain("adminClient()");
      expect(client).not.toContain("{ ac, roles }");
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
});
