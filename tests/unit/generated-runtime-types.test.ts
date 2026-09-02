import { describe, expect, test } from "bun:test";
import { runtime as runtimeVersions } from "../../packages/versions/src/index.js";
import { modulesComposerFiles } from "../../src/templates/modes/monorepo/modules-composer.js";

type ExecutionRuntime = "bun" | "node";

function generated(runtime: ExecutionRuntime) {
  return modulesComposerFiles(runtime, false, false);
}

function jsonAt(files: ReturnType<typeof generated>, path: string): Record<string, unknown> {
  const content = files.find((entry) => entry.path === path)?.content;
  expect(content, `${path} was not generated`).toBeDefined();
  return objectAt(JSON.parse(content ?? "{}") as unknown, path);
}

function objectAt(value: unknown, label: string): Record<string, unknown> {
  expect(value && typeof value === "object", `${label} must contain an object`).toBe(true);
  return value as Record<string, unknown>;
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

describe("generated monorepo execution-runtime typing", () => {
  test("Bun runtime keeps the full Bun source and bun:test ambient types", () => {
    const files = generated("bun");
    const manifest = jsonAt(files, "packages/modules/package.json");
    const tsconfig = jsonAt(files, "packages/modules/tsconfig.json");
    const compilerOptions = objectAt(tsconfig.compilerOptions, "compilerOptions");
    const devDependencies = stringMap(manifest.devDependencies);

    expect(devDependencies["bun-types"]).toBe(runtimeVersions.bun);
    expect(devDependencies["@types/node"]).toBeUndefined();
    expect(stringArray(compilerOptions.types)).toEqual(["bun-types"]);
    expect(stringMap(manifest.scripts).test).toBe("bun test");
    expect(
      files.find(({ path }) => path === "packages/modules/tests/identity/get-profile.test.ts")
        ?.content,
    ).toContain('from "bun:test"');
  });

  test("runtime.node.generated-matrix.v1: Node keeps Node source types and narrow Bun test types", () => {
    const files = generated("node");
    const manifest = jsonAt(files, "packages/modules/package.json");
    const tsconfig = jsonAt(files, "packages/modules/tsconfig.json");
    const compilerOptions = objectAt(tsconfig.compilerOptions, "compilerOptions");
    const devDependencies = stringMap(manifest.devDependencies);
    const types = stringArray(compilerOptions.types);

    expect(devDependencies["bun-types"]).toBe(runtimeVersions.bun);
    expect(devDependencies["@types/node"]).toBe(runtimeVersions["@types/node"]);
    expect(types).toEqual(["bun-types/test", "node"]);
    expect(types).not.toContain("bun-types");
    expect(stringMap(manifest.scripts).test).toBe("bun test");
    expect(
      files.find(({ path }) => path === "packages/modules/tests/identity/get-profile.test.ts")
        ?.content,
    ).toContain('from "bun:test"');
  });
});
