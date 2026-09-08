import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

describe("disabled database tooling", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const runtime of ["node", "bun"] as const) {
      test(`${framework}/${runtime} retains the marker without advertising persistence commands`, () => {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "no-database-tools",
            mode: "monorepo",
            framework,
            runtime,
            database: "none",
            preset: "frontend",
            apps: ["web"],
            auth: false,
            api: false,
            billing: [],
            cache: "none",
            deploy: "none",
            features: [],
          }),
          { dryRun: true },
        );
        const manifestFile = files.find((file) => file.path === "packages/database/package.json");
        expect(manifestFile).toBeDefined();
        const manifest = JSON.parse(manifestFile!.content) as {
          scripts: Record<string, string>;
          dependencies: Record<string, string>;
          devDependencies: Record<string, string>;
        };
        expect(Object.keys(manifest.scripts).filter((name) => name.startsWith("db:"))).toEqual([]);
        const rootManifest = JSON.parse(
          files.find((file) => file.path === "package.json")!.content,
        ) as {
          scripts: Record<string, string>;
        };
        expect(Object.keys(rootManifest.scripts).filter((name) => name.startsWith("db:"))).toEqual(
          [],
        );
        expect(manifest.dependencies["drizzle-orm"]).toBeUndefined();
        expect(manifest.devDependencies["drizzle-kit"]).toBeUndefined();
        expect(
          files.find((file) => file.path === "packages/database/src/disabled.ts")?.content,
        ).toContain("readonly [property: string]: never");
      });
    }
  }
});
