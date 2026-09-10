import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import { buildDependencySecurityRuntimeArtifact } from "../../scripts/embed-dependency-security-runtime.js";
import { dependencyAuditScriptContent } from "../../src/templates/tooling/dependency-audit-policy.js";

const root = resolve(import.meta.dir, "../..");
const generatedAuditFixture =
  "tests/fixtures/compatibility/expo-uniwind-rnr/scripts/audit-dependencies.ts";
const generatedSecurityRuntime = "src/generation/embedded-dependency-security-runtime.ts";

function authoredBunVersionDeclarations(
  path: string,
  content: string,
  rawVersion: RegExp,
  generatedSources: ReadonlyMap<string, string>,
): string[] {
  const expected = generatedSources.get(path);
  if (expected !== undefined) {
    // Only the older committed fixture permits checkout newline normalization.
    // The bundled module must match its owning build/render recipe byte for byte.
    const observed = path === generatedAuditFixture ? content.replace(/\r\n?/g, "\n") : content;
    if (observed !== expected)
      throw new Error(`Generated Bun-version artifact does not match its owning recipe: ${path}`);
    return [];
  }
  return content
    .split(/\r?\n/)
    .flatMap((line, index) => (rawVersion.test(line) ? [`${path}:${index + 1}`] : []));
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object while validating Bun version synchronization");
  }
  return value as Record<string, unknown>;
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function collectBunSchemaVersions(
  value: unknown,
  path = "$",
): Array<{ path: string; version: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectBunSchemaVersions(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const name = object.name;
  const version = object.version;
  const own =
    name &&
    typeof name === "object" &&
    (name as Record<string, unknown>).const === "bun" &&
    version &&
    typeof version === "object" &&
    Object.hasOwn(version as object, "const")
      ? [{ path, version: (version as Record<string, unknown>).const }]
      : [];
  return [
    ...own,
    ...Object.entries(object).flatMap(([key, child]) =>
      collectBunSchemaVersions(child, `${path}.${key}`),
    ),
  ];
}

describe("Bun version single source of truth", () => {
  test("production, scripts, and tests import the canonical version instead of re-authoring it", async () => {
    const escapedVersion = runtime.bun.replaceAll(".", "\\.");
    const rawVersion = new RegExp(`["']${escapedVersion}["']`);
    const committedBefore = readFileSync(resolve(root, generatedSecurityRuntime), "utf8");
    const artifact = await buildDependencySecurityRuntimeArtifact(root);
    expect(readFileSync(resolve(root, generatedSecurityRuntime), "utf8")).toBe(committedBefore);
    expect(
      artifact.receipt.inputs.some(
        (path) =>
          path.replaceAll("\\", "/") === "packages/versions/src/index.ts" ||
          path.replaceAll("\\", "/").endsWith("/packages/versions/src/index.ts"),
      ),
    ).toBe(true);
    // These two exact paths are generated data, independently bound to their
    // owning recipes. No generation directory or filename pattern is exempted.
    const generatedSources = new Map([
      [generatedAuditFixture, dependencyAuditScriptContent(true).replace(/\r\n?/g, "\n")],
      [generatedSecurityRuntime, artifact.moduleContent],
    ]);
    const reauthored = `export const version = ${JSON.stringify(runtime.bun)};\n`;
    for (const path of [
      "src/lib/reauthored.ts",
      "src/generation/embedded-dependency-security-runtime-copy.ts",
    ]) {
      expect(
        authoredBunVersionDeclarations(path, reauthored, rawVersion, generatedSources),
      ).toEqual([`${path}:1`]);
    }
    expect(() =>
      authoredBunVersionDeclarations(
        generatedSecurityRuntime,
        `${artifact.moduleContent}\n// handwritten change\n`,
        rawVersion,
        generatedSources,
      ),
    ).toThrow("owning recipe");
    const offenders = ["src", "scripts", "tests"]
      .flatMap((directory) => collectTypeScriptFiles(resolve(root, directory)))
      .flatMap((path) =>
        authoredBunVersionDeclarations(
          relative(root, path).replaceAll("\\", "/"),
          readFileSync(path, "utf8"),
          rawVersion,
          generatedSources,
        ),
      );
    expect(offenders).toEqual([]);

    const registry = readFileSync(resolve(root, "packages/versions/src/index.ts"), "utf8");
    const canonicalDeclarations = registry.match(
      new RegExp(`\\bbun:\\s*["']${escapedVersion}["']`, "g"),
    );
    expect(canonicalDeclarations).toHaveLength(1);
  });

  test("host manifest and lock stay synchronized with runtime.bun", () => {
    const manifest = readJson(resolve(root, "package.json"));
    expect(record(manifest.engines).bun).toBe(runtime.bun);
    expect(manifest.packageManager).toBe(`bun@${runtime.bun}`);
    expect(record(manifest.devDependencies)["@types/bun"]).toBe(runtime.bun);

    const lock = Bun.JSONC.parse(readFileSync(resolve(root, "bun.lock"), "utf8")) as {
      workspaces: { "": { devDependencies?: Record<string, string> } };
      packages: Record<string, [string, string, { dependencies?: Record<string, string> }?]>;
    };
    expect(lock.workspaces[""].devDependencies?.["@types/bun"]).toBe(runtime.bun);
    expect(lock.packages["@types/bun"]?.[0]).toBe(`@types/bun@${runtime.bun}`);
    expect(lock.packages["@types/bun"]?.[2]?.dependencies?.["bun-types"]).toBe(runtime.bun);
    expect(lock.packages["bun-types"]?.[0]).toBe(`bun-types@${runtime.bun}`);
  });

  test("every committed setup-bun workflow step uses runtime.bun", () => {
    const workflowDirectory = resolve(root, ".github/workflows");
    const workflowFiles = readdirSync(workflowDirectory)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();
    let setupSteps = 0;
    for (const name of workflowFiles) {
      const workflow = Bun.YAML.parse(readFileSync(join(workflowDirectory, name), "utf8")) as {
        jobs?: Record<string, { steps?: Array<{ uses?: string; with?: Record<string, unknown> }> }>;
      };
      for (const job of Object.values(workflow.jobs ?? {})) {
        for (const step of job.steps ?? []) {
          if (!step.uses?.startsWith("oven-sh/setup-bun@")) continue;
          setupSteps += 1;
          expect(step.with?.["bun-version"], `${name}: ${step.uses}`).toBe(runtime.bun);
        }
      }
    }
    expect(setupSteps).toBeGreaterThan(0);
  });

  test("all static config schemas bind Bun to runtime.bun", () => {
    const schemaDirectory = resolve(root, "schemas");
    const bindings = readdirSync(schemaDirectory)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .flatMap((name) =>
        collectBunSchemaVersions(readJson(join(schemaDirectory, name))).map((binding) => ({
          schema: name,
          ...binding,
        })),
      );
    expect(bindings.map(({ schema }) => schema).sort()).toEqual([
      "project-config.schema.json",
      "resolved-project-config.schema.json",
      "support-catalog.schema.json",
    ]);
    for (const binding of bindings) {
      expect(binding.version, `${binding.schema}:${binding.path}`).toBe(runtime.bun);
    }
  });

  test("every compatibility fixture manifest and lock uses runtime.bun", () => {
    const fixtureRoot = resolve(root, "tests/fixtures/compatibility");
    const fixtureNames = readdirSync(fixtureRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(fixtureNames.length).toBeGreaterThan(0);
    for (const fixture of fixtureNames) {
      const directory = join(fixtureRoot, fixture);
      const manifest = readJson(join(directory, "package.json"));
      expect(manifest.packageManager, fixture).toBe(`bun@${runtime.bun}`);
      const lock = Bun.JSONC.parse(readFileSync(join(directory, "bun.lock"), "utf8")) as {
        workspaces: {
          "": {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
          };
        };
        packages: Record<string, [string, ...unknown[]]>;
      };
      const manifestDependencies = {
        ...record(manifest.dependencies ?? {}),
        ...record(manifest.devDependencies ?? {}),
      };
      const lockDependencies = {
        ...lock.workspaces[""].dependencies,
        ...lock.workspaces[""].devDependencies,
      };
      for (const dependency of ["bun-types", "@types/bun"]) {
        if (Object.hasOwn(manifestDependencies, dependency)) {
          expect(manifestDependencies[dependency], `${fixture}:${dependency}`).toBe(runtime.bun);
          expect(lockDependencies[dependency], `${fixture}:lock:${dependency}`).toBe(runtime.bun);
          expect(lock.packages[dependency]?.[0], `${fixture}:resolved:${dependency}`).toBe(
            `${dependency}@${runtime.bun}`,
          );
        }
      }
    }
  });
});
