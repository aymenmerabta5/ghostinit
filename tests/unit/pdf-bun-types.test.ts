import { describe, expect, test } from "bun:test";
import { runtime } from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function generated(mode: Mode, framework: Framework) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "pdf-bun-types",
      mode,
      framework,
      database: "postgres",
      preset: "custom",
      auth: true,
      api: true,
      pdf: true,
      billing: [],
      apps: ["web"],
      features: [],
    }),
    { dryRun: true },
  );
}

function jsonAt(files: ReturnType<typeof generated>, path: string): Record<string, unknown> {
  const source = files.find((entry) => entry.path === path)?.content;
  expect(source, `${path} was not generated`).toBeDefined();
  const parsed: unknown = JSON.parse(source ?? "{}");
  expect(parsed && typeof parsed === "object", `${path} must contain an object`).toBe(true);
  return parsed as Record<string, unknown>;
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

describe("generated PDF Bun test typing", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} resolves bun:test from the Bun 1.4 SSOT`, () => {
        const files = generated(mode, framework);
        const testPath =
          mode === "monorepo"
            ? "packages/pdf/tests/barrel.test.ts"
            : "src/server/pdf/tests/barrel.test.ts";
        expect(files.some(({ path }) => path === testPath)).toBe(true);

        const manifestPath = mode === "monorepo" ? "packages/pdf/package.json" : "package.json";
        const manifest = jsonAt(files, manifestPath);
        const devDependencies = stringMap(manifest.devDependencies);
        expect(devDependencies["bun-types"]).toBe(runtime.bun);

        const tsconfigPath = mode === "monorepo" ? "packages/pdf/tsconfig.json" : "tsconfig.json";
        const tsconfig = jsonAt(files, tsconfigPath);
        const compilerOptions =
          tsconfig.compilerOptions && typeof tsconfig.compilerOptions === "object"
            ? (tsconfig.compilerOptions as Record<string, unknown>)
            : {};
        const types = Array.isArray(compilerOptions.types) ? compilerOptions.types : [];
        expect(types).toContain("bun-types/test");
        expect(types).not.toContain("bun-types");

        if (mode === "monorepo") {
          expect(tsconfig.include).toEqual(["src/**/*", "tests/**/*"]);
          expect(compilerOptions.rootDir).toBe(".");
        } else if (framework === "tanstack-start") {
          expect(types).toContain("vite/client");
        }
      });
    }
  }
});
