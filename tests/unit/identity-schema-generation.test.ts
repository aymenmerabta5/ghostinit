import { describe, expect, it } from "bun:test";
import { extname, posix } from "node:path";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { identityDataModelBlueprint } from "../../src/domain/data-model/index.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function config(
  mode: ProjectConfig["mode"],
  framework: ProjectConfig["framework"],
  database: ProjectConfig["database"],
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "identity-schema",
    mode,
    framework,
    database,
    runtime: "bun",
    apps: ["web"],
    billing: [],
    features: [],
  });
}

function read(files: TemplateFile[], path: string): string {
  const match = files.find((file) => file.path === path);
  if (!match) throw new Error(`Expected generated file ${path}`);
  return match.content;
}

const databaseOwnedPath = (path: string): boolean =>
  path.startsWith("packages/database/") ||
  path.startsWith("src/server/db/") ||
  path.startsWith("convex/");

function unresolvedDatabaseImports(files: TemplateFile[]): string[] {
  const paths = new Set(files.map((file) => file.path));
  const missing: string[] = [];
  for (const file of files) {
    if (!databaseOwnedPath(file.path) || !/\.[cm]?[jt]sx?$/.test(file.path)) continue;
    for (const reference of parseFile(file.content, extname(file.path)).importReferences) {
      if (!reference.specifier.startsWith(".")) continue;
      const normalized = posix.normalize(
        posix.join(posix.dirname(file.path), reference.specifier.split(/[?#]/, 1)[0] ?? ""),
      );
      if (normalized.includes("/_generated/")) continue;
      const withoutJs = normalized.replace(/\.(?:c|m)?js$/, "");
      const candidates = [
        normalized,
        withoutJs,
        `${withoutJs}.ts`,
        `${withoutJs}.tsx`,
        `${withoutJs}.json`,
        `${withoutJs}/index.ts`,
        `${withoutJs}/index.tsx`,
      ];
      if (!candidates.some((candidate) => paths.has(candidate))) {
        missing.push(`${file.path} -> ${reference.specifier}`);
      }
    }
  }
  return missing.sort();
}

describe("generated identity schema conformance", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      it(`${mode}/${framework}/postgres renders every selected plugin table and binding`, () => {
        const files = generateProjectFiles(config(mode, framework, "postgres"));
        const schemaPath =
          mode === "monorepo"
            ? "packages/database/src/schema/auth.ts"
            : "src/server/db/schema/auth.ts";
        const authPath =
          mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts";
        const schema = read(files, schemaPath);
        const auth = read(files, authPath);

        for (const entity of identityDataModelBlueprint.entities) {
          if (entity.storage.kind !== "table" || !entity.storage.postgresExport) continue;
          expect(schema, entity.id).toContain(
            `export const ${entity.storage.postgresExport} = pgTable(`,
          );
        }
        for (const [model, binding] of [
          ["user", "users"],
          ["account", "accounts"],
          ["session", "sessions"],
          ["verification", "verifications"],
          ["twoFactor", "twoFactors"],
          ["passkey", "passkeys"],
          ["organization", "organizations"],
          ["member", "members"],
          ["invitation", "invitations"],
          ["team", "teams"],
          ["teamMember", "teamMembers"],
          ["organizationRole", "organizationRoles"],
        ] as const) {
          const expected =
            mode === "monorepo" ? `${model}: ${binding},` : `${model}: schema.${binding},`;
          expect(auth).toContain(expected);
        }
        expect(auth).toContain("passkey()");
        expect(auth).toContain("teams: { enabled: true }");
        expect(auth).toContain("dynamicAccessControl: { enabled: true }");
        const capability =
          mode === "monorepo" ? read(files, "packages/auth/src/identity-capabilities.ts") : auth;
        expect(capability).toContain("selectedIdentityPlugins");
        expect(capability).toMatch(/["']admin["']/);
        expect(capability).toMatch(/["']organization["']/);
      });
    }
  }

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    it(`single/${framework}/postgres billing-off has a closed Drizzle toolchain`, () => {
      const files = generateProjectFiles(config("single", framework, "postgres"));
      const paths = files.map((file) => file.path);
      const database = read(files, "src/server/db/index.ts");
      const drizzleConfig = read(files, "drizzle.config.ts");
      const manifest = JSON.parse(read(files, "package.json")) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
        scripts: Record<string, string>;
      };

      expect(paths).not.toContain("src/server/db/schema/billing.ts");
      expect(database).not.toContain("./schema/billing");
      expect(database).not.toContain("billingSchema");
      expect(drizzleConfig).toContain("./src/server/db/schema/**/*.ts");
      expect(drizzleConfig).toContain("dbCredentials: { url: connectionUrl() }");
      expect(manifest.dependencies["@better-auth/passkey"]).toBeDefined();
      expect(manifest.devDependencies["drizzle-kit"]).toBeDefined();
      expect(manifest.scripts["db:generate"]).toBe(
        "bun --env-file=.env.local drizzle-kit generate",
      );
      expect(manifest.scripts["db:migrate"]).toBe("bun --env-file=.env.local drizzle-kit migrate");
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      it(`${mode}/${framework}/convex advertises only the stock component capability`, () => {
        const files = generateProjectFiles(config(mode, framework, "convex"));
        const clientPath =
          mode === "monorepo" ? "packages/auth/src/client.ts" : "src/lib/auth-client.ts";
        const client = read(files, clientPath);
        const convexAuth = read(files, "convex/auth.ts");

        expect(client).toContain("twoFactorClient");
        expect(client).not.toContain("adminClient");
        expect(client).not.toContain("passkeyClient");
        expect(client).not.toContain("organizationClient");
        expect(convexAuth).toContain('selectedIdentityPlugins = ["two-factor"]');
        expect(convexAuth).toContain(
          'rejectedIdentityPlugins = ["admin", "passkey", "organization"]',
        );
        expect(convexAuth).toContain("twoFactor({ issuer: betterAuthUrl");
        expect(convexAuth).toContain("accountLockout: { enabled: false }");
        expect(convexAuth).not.toContain("admin({");
        expect(convexAuth).not.toContain("passkey()");
        expect(convexAuth).not.toContain("organization(");
      });
    }
  }

  it("keeps database imports and capability emission closed across 160 billing-off configs", () => {
    const appSelections = [
      ["web"],
      ["mobile"],
      ["desktop"],
      ["web", "mobile"],
      ["web", "desktop"],
    ] as const;
    let configurations = 0;

    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["postgres", "convex"] as const) {
          for (const auth of [false, true]) {
            for (const api of [false, true]) {
              for (const apps of appSelections) {
                configurations += 1;
                const key = `${mode}/${framework}/${database}/auth=${auth}/api=${api}/${apps.join("+")}`;
                const files = generateProjectFiles(
                  projectConfigSchema.parse({
                    name: "identity-closure",
                    mode,
                    framework,
                    database,
                    preset: "custom",
                    auth,
                    api,
                    email: false,
                    analytics: false,
                    billing: [],
                    apps: [...apps],
                    features: [],
                  }),
                );
                const paths = new Set(files.map((file) => file.path));
                expect(unresolvedDatabaseImports(files), key).toEqual([]);
                expect(paths.has("convex/billing.ts"), key).toBe(false);
                expect(paths.has("packages/database/src/schema/billing.ts"), key).toBe(false);
                expect(paths.has("src/server/db/schema/billing.ts"), key).toBe(false);
                const effectiveAuth = auth || api;

                if (database === "convex" && paths.has("convex/schema.ts")) {
                  const schema = read(files, "convex/schema.ts");
                  expect(schema, key).not.toContain("products: defineTable");
                  expect(schema, key).not.toContain("billingProvider =");
                  if (!effectiveAuth) {
                    expect(schema, key).not.toContain("users: defineTable");
                    expect(schema, key).not.toContain("posts: defineTable");
                    const http = read(files, "convex/http.ts");
                    expect(http, key).not.toContain('from "./auth"');
                    expect(http, key).not.toContain("/api/auth/");
                  }
                }

                if (!effectiveAuth) {
                  expect(paths.has("convex/auth.ts"), key).toBe(false);
                  expect(paths.has("convex/auth.adapter.ts"), key).toBe(false);
                  expect(paths.has("convex/lib/auth.ts"), key).toBe(false);
                  expect(paths.has("convex/users.ts"), key).toBe(false);
                  expect(paths.has("convex/posts.ts"), key).toBe(false);
                  expect(paths.has("packages/database/src/schema/auth.ts"), key).toBe(false);
                  expect(paths.has("src/server/db/schema/auth.ts"), key).toBe(false);
                  const convexManifest = files.find(
                    (file) => file.path === "packages/database/package.json",
                  );
                  if (database === "convex" && convexManifest) {
                    const dependencies = (
                      JSON.parse(convexManifest.content) as {
                        dependencies?: Record<string, string>;
                      }
                    ).dependencies;
                    expect(dependencies?.["@convex-dev/better-auth"], key).toBeUndefined();
                    expect(dependencies?.["better-auth"], key).toBeUndefined();
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(configurations).toBe(160);
  });
});
