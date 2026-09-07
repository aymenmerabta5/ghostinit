import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runtime as runtimeVersions } from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

describe("single TanStack auth declaration types", () => {
  test("owns every root ambient type dependency directly", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "single-tanstack-auth-types",
        runtime: "bun",
        version: "0.1.0",
        mode: "single",
        preset: "saas",
        billing: [],
        features: [],
        database: "postgres",
        framework: "tanstack-start",
        apps: ["web"],
      }),
    );
    const read = (path: string): string =>
      files.find((entry) => entry.path === path)?.content ?? "";
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const tsconfig = JSON.parse(read("tsconfig.json")) as {
      compilerOptions?: { types?: string[] };
    };
    const declared = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    expect(tsconfig.compilerOptions?.types).toEqual(["bun-types/test", "node", "vite/client"]);
    expect(declared["bun-types"]).toBe(runtimeVersions.bun);
    expect(declared["@types/node"]).toBe(runtimeVersions["@types/node"]);
    expect(declared.vite).toBeDefined();
  });

  test("scopes the portable auth declaration probe to server types", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../scripts/test-generated.ts"),
      "utf8",
    );
    const start = source.indexOf("export async function verifyAuthDeclarations(");
    const end = source.indexOf("async function main()", start);
    const probe = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(probe).toContain('types: ["node"]');
    expect(probe).toContain("typeRoots: variant.typeRoots");
    expect(probe).not.toContain('types: ["bun-types/test", "node", "vite/client"]');
  });
});
