import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function maximalPostgres(mode: Mode, framework: Framework) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "schema-resolution",
      mode,
      framework,
      database: "postgres",
      preset: "custom",
      auth: true,
      api: true,
      email: true,
      analytics: true,
      billing: ["stripe", "chargily"],
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      pdf: true,
      cache: "redis",
      apps: ["web"],
      features: ["eve", "i18n"],
    }),
    { dryRun: true },
  );
}

function relativeExports(source: string): string[] {
  return [...source.matchAll(/export\s+(?:\*|\{[^}]+\})\s+from\s+["'](\.[^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );
}

describe("Postgres schema barrel production resolution", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} emits extensionless source exports with physical targets`, () => {
        const files = maximalPostgres(mode, framework);
        const paths = new Set(files.map(({ path }) => path));
        const barrelPath =
          mode === "monorepo"
            ? "packages/database/src/schema/index.ts"
            : "src/server/db/schema/index.ts";
        const barrel = files.find(({ path }) => path === barrelPath)?.content;
        expect(barrel, `${barrelPath} was not generated`).toBeDefined();
        expect(barrel).not.toMatch(/from\s+["']\.\/[^"']+\.js["']/);

        for (const specifier of relativeExports(barrel ?? "")) {
          const target = posix.normalize(posix.join(posix.dirname(barrelPath), specifier));
          expect(
            paths.has(`${target}.ts`) || paths.has(`${target}/index.ts`),
            `${barrelPath} -> ${specifier}`,
          ).toBe(true);
        }

        expect(barrel).toContain('from "./notifications";');
        expect(barrel).toContain('from "./jobs";');
        expect(barrel).toContain('from "./storage";');
      });
    }
  }
});
