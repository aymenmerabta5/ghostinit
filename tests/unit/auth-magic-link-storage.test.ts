import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";

function generate(mode: Mode, framework: Framework, database: Database): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "magic-link-storage",
      runtime: "bun",
      mode,
      framework,
      database,
      preset: "custom",
      auth: true,
      api: true,
      email: true,
      analytics: false,
      billing: [],
      apps: ["web"],
      features: [],
    }),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const match = files.find((file) => file.path === path);
  if (!match) throw new Error(`Missing generated file: ${path}`);
  return match.content;
}

describe("generated Better Auth magic-link token storage", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} hashes the persisted bearer token`, () => {
          const files = generate(mode, framework, database);
          const serverPath =
            database === "convex"
              ? "convex/auth.ts"
              : mode === "monorepo"
                ? "packages/auth/src/server.ts"
                : "src/server/auth/index.ts";
          const server = read(files, serverPath);

          expect(server).toMatch(/magicLink\(\{\s*storeToken: "hashed",/);
          expect(server).not.toContain('storeToken: "plain"');
          expect(server.match(/storeToken: "hashed"/g)).toHaveLength(1);
        });
      }
    }
  }
});
