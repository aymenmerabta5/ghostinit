import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import {
  buildDependencySecurityRuntimeArtifact,
  embedDependencySecurityRuntime,
  verifyDependencySecurityBundle,
} from "../../scripts/embed-dependency-security-runtime.js";
import { FsTransaction } from "../../src/lib/fs.js";

const roots: string[] = [];
const requireBuiltin = createRequire(import.meta.url);
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const child = relative(resolve(tmpdir()), resolve(root));
    if (!child || child === ".." || child.startsWith(".." + sep) || isAbsolute(child)) {
      throw new Error("Refusing unsafe bundle fixture cleanup");
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function fixture(files: Readonly<Record<string, string>>): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-security-bundle-"));
  roots.push(root);
  const tx = new FsTransaction(root);
  for (const [path, source] of Object.entries(files)) await tx.write(path, source);
  expect(tx.getStagedFiles()).toHaveLength(Object.keys(files).length);
  await tx.commit();
  return root;
}

function metadata(
  inputs: Bun.BuildMetafile["inputs"] = {},
  imports: Bun.BuildMetafile["outputs"][string]["imports"] = [],
): Bun.BuildMetafile {
  return { inputs, outputs: { "runtime.cjs": { bytes: 0, inputs: {}, imports, exports: [] } } };
}

describe("dependency security embedded bundle boundary", () => {
  test("building and rendering the artifact does not publish or rewrite files", async () => {
    const root = await fixture({
      "src/lib/dependency-security/runtime.ts":
        'export function runDependencySecurity() { return "fixture"; }\n',
    });
    const artifact = await buildDependencySecurityRuntimeArtifact(root);
    expect(artifact.source).toContain("runDependencySecurity");
    expect(artifact.moduleContent).toContain("DEPENDENCY_SECURITY_RUNTIME_SHA256");
    expect(artifact.moduleContent).toContain(artifact.receipt.sha256);
    expect(existsSync(join(root, "src/generation/embedded-dependency-security-runtime.ts"))).toBe(
      false,
    );
  });

  test("bundles the pinned Zod implementation with no package loader available", async () => {
    const root = await fixture({
      "src/lib/dependency-security/runtime.ts":
        'import { z } from "zod";\nconst schema = z.object({ kind: z.enum(["safe", "other"]), count: z.number().int().optional() }).strict();\nexport function runDependencySecurity(input: unknown) { return schema.parse(input); }\n',
    });
    const receipt = await embedDependencySecurityRuntime(root);
    expect(receipt.inputs.some((path) => /[/\\]zod[/\\]/.test(path))).toBe(true);
    expect(receipt.externalImports.every(isBuiltin)).toBe(true);
    expect(existsSync(join(root, "node_modules"))).toBe(false);
    const embedded = await import(
      pathToFileURL(join(root, "src/generation/embedded-dependency-security-runtime.ts")).href
    );
    const commonjs = { exports: {} as Record<string, unknown> };
    runInNewContext(embedded.DEPENDENCY_SECURITY_RUNTIME, {
      module: commonjs,
      exports: commonjs.exports,
      require(path: string) {
        if (!isBuiltin(path)) throw new Error("Unexpected runtime package dependency: " + path);
        return requireBuiltin(path);
      },
    });
    const run = commonjs.exports.runDependencySecurity as (input: unknown) => {
      kind: string;
      count?: number;
    };
    expect(typeof run).toBe("function");
    expect(run({ kind: "safe", count: 2 })).toEqual({ kind: "safe", count: 2 });
    expect(() => run({ kind: "invalid" })).toThrow();
    expect(() => run(42)).toThrow();
  });

  test("rejects unbundled static require, static import, and dynamic import packages", () => {
    for (const source of [
      'module.exports = require("zod");',
      'import { z } from "zod"; export { z };',
      'module.exports = () => import("zod");',
    ]) {
      expect(() => verifyDependencySecurityBundle(source, metadata())).toThrow(
        "non-builtin external import: zod",
      );
    }
    expect(() =>
      verifyDependencySecurityBundle(
        "module.exports = {};",
        metadata({}, [{ path: "unresolved-package", kind: "require-call" }]),
      ),
    ).toThrow("non-builtin external import: unresolved-package");
  });

  test("input-edge flags do not confuse bundled sources with emitted runtime references", () => {
    const receipt = verifyDependencySecurityBundle(
      'module.exports = require("node:crypto");',
      metadata({
        "node_modules/zod/v4/classic/external.js": {
          bytes: 1,
          imports: [{ path: "../core/index.js", kind: "import-statement", external: true }],
        },
        "node_modules/zod/v4/core/index.js": { bytes: 1, imports: [] },
      }),
    );
    expect(receipt.externalImports).toEqual(["node:crypto"]);
  });

  test("rejects compiler, renderer, command, and native parser reachability", () => {
    for (const path of [
      "src/templates/renderer.ts",
      "src/generation/resolved-template-compiler.ts",
      "src/commands/create.ts",
      "node_modules/.bun/oxc-parser@0.147.0/node_modules/oxc-parser/index.js",
    ]) {
      expect(() =>
        verifyDependencySecurityBundle(
          "module.exports = {};",
          metadata({ [path]: { bytes: 1, imports: [] } }),
        ),
      ).toThrow("compiler or renderer code");
    }
  });

  test("a real renderer import fails before an embedded artifact is published", async () => {
    const root = await fixture({
      "src/lib/dependency-security/runtime.ts":
        'export { render as runDependencySecurity } from "../../templates/renderer.ts";\n',
      "src/templates/renderer.ts": 'export function render() { return "renderer"; }\n',
    });
    await expect(embedDependencySecurityRuntime(root)).rejects.toThrow("compiler or renderer code");
    expect(existsSync(join(root, "src/generation/embedded-dependency-security-runtime.ts"))).toBe(
      false,
    );
  });

  test("missing runtime source cannot produce a placeholder artifact", async () => {
    const root = await fixture({});
    await expect(embedDependencySecurityRuntime(root)).rejects.toThrow();
    expect(existsSync(join(root, "src/generation/embedded-dependency-security-runtime.ts"))).toBe(
      false,
    );
  });
});
