import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  collectSourceFiles,
  discoverPackages,
} from "../../src/lib/architecture/collectors/index.js";
import type { ArchitectureFinding } from "../../src/lib/architecture/types.js";

describe("architecture collection", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-collection-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function file(path: string, content = "export const value = true;\n"): void {
    const absolute = join(root, ...path.split("/"));
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf-8");
  }

  function manifest(path: string, value: Record<string, unknown>): void {
    file(path, `${JSON.stringify(value)}\n`);
  }

  function relativeFiles(files: string[]): string[] {
    return files.map((path) => relative(root, path).replace(/\\/g, "/"));
  }

  test("discovers the root package, declared workspaces, and conventional workspaces", async () => {
    manifest("package.json", {
      name: "single-or-root",
      workspaces: ["services/*"],
      dependencies: { zod: "*" },
    });
    manifest("apps/web/package.json", { name: "web" });
    manifest("packages/core/package.json", { name: "@repo/core" });
    manifest("tooling/lint/package.json", { name: "@repo/lint" });
    manifest("services/jobs/package.json", {
      name: "@repo/jobs",
      peerDependencies: { react: "*" },
    });

    const findings: ArchitectureFinding[] = [];
    const packages = await discoverPackages(root, findings);

    expect(packages.map(({ name }) => name)).toEqual([
      "single-or-root",
      "web",
      "@repo/core",
      "@repo/jobs",
      "@repo/lint",
    ]);
    expect(packages.find(({ name }) => name === "single-or-root")?.dependencies).toContain("zod");
    expect(packages.find(({ name }) => name === "@repo/jobs")?.dependencies).toContain("react");
    expect(findings).toEqual([]);
  });

  test("collects one package when workspace aliases share a canonical manifest", async () => {
    manifest("package.json", { name: "root", workspaces: ["apps/*"] });
    manifest("manifests/mobile.json", { name: "mobile" });
    const canonicalManifest = join(root, "manifests", "mobile.json");
    for (const app of ["desktop", "mobile"]) {
      const appDirectory = join(root, "apps", app);
      mkdirSync(appDirectory, { recursive: true });
      symlinkSync(canonicalManifest, join(appDirectory, "package.json"), "file");
    }

    const findings: ArchitectureFinding[] = [];
    const packages = await discoverPackages(root, findings);

    expect(packages.map(({ name }) => name)).toEqual(["root", "mobile"]);
    expect(findings).toEqual([]);
  });

  test("rejects the same package name from distinct canonical manifests", async () => {
    manifest("package.json", { name: "root", workspaces: ["apps/*"] });
    manifest("apps/desktop/package.json", { name: "client" });
    manifest("apps/mobile/package.json", { name: "client" });

    const findings: ArchitectureFinding[] = [];
    const packages = await discoverPackages(root, findings);

    expect(packages.filter(({ name }) => name === "client")).toHaveLength(2);
    expect(findings).toEqual([
      expect.objectContaining({
        id: "duplicate-package-name",
        severity: "BLOCKER",
        message: "Duplicate package name: client",
        file: "apps/mobile/package.json",
      }),
    ]);
  });

  test("covers all configured source roots and module extensions deterministically", async () => {
    manifest("package.json", { name: "root" });
    for (const path of [
      "vite.config.mts",
      "src/index.ts",
      "app/page.tsx",
      "tests/root.test.cts",
      "convex/query.js",
      "agent/worker.mjs",
      "apps/mobile/app/index.jsx",
      "apps/desktop/src/main.cjs",
      "apps/eve/evals/score.mts",
      "apps/web/e2e/smoke.ts",
      "packages/core/src/index.ts",
      "tooling/lint/tests/rule.test.js",
      "quality/custom.ts",
    ]) {
      file(path);
    }
    file("convex/_generated/api.ts");
    file("src/build/generated.ts");
    file("apps/web/node_modules/dependency.ts");
    file("notes.json");

    const findings: ArchitectureFinding[] = [];
    const packages = await discoverPackages(root, findings);
    const files = await collectSourceFiles(root, packages, findings, {
      sourceRoots: ["quality"],
    });

    expect(relativeFiles(files)).toEqual([
      "agent/worker.mjs",
      "app/page.tsx",
      "apps/desktop/src/main.cjs",
      "apps/eve/evals/score.mts",
      "apps/mobile/app/index.jsx",
      "apps/web/e2e/smoke.ts",
      "convex/query.js",
      "packages/core/src/index.ts",
      "quality/custom.ts",
      "src/index.ts",
      "tests/root.test.cts",
      "tooling/lint/tests/rule.test.js",
      "vite.config.mts",
    ]);
    expect(findings).toEqual([]);
  });

  test("stops immediately with a blocker when the source-file budget is exhausted", async () => {
    manifest("package.json", { name: "root" });
    file("src/a.ts");
    file("src/b.ts");
    file("src/c.ts");
    const findings: ArchitectureFinding[] = [];

    const files = await collectSourceFiles(root, [], findings, { maxSourceFiles: 1 });

    expect(relativeFiles(files)).toEqual(["src/a.ts"]);
    expect(findings).toContainEqual(
      expect.objectContaining({ id: "source-collection-limit", severity: "BLOCKER" }),
    );
  });

  test("stops with blockers at entry and depth budgets", async () => {
    manifest("package.json", { name: "root" });
    file("src/a.ts");
    file("src/nested/b.ts");

    const entryFindings: ArchitectureFinding[] = [];
    const entryFiles = await collectSourceFiles(root, [], entryFindings, { maxEntries: 1 });
    expect(entryFiles).toEqual([]);
    expect(entryFindings).toContainEqual(
      expect.objectContaining({ id: "source-entry-limit", severity: "BLOCKER" }),
    );

    const depthFindings: ArchitectureFinding[] = [];
    const depthFiles = await collectSourceFiles(root, [], depthFindings, { maxDepth: 0 });
    expect(relativeFiles(depthFiles)).toEqual(["src/a.ts"]);
    expect(depthFindings).toContainEqual(
      expect.objectContaining({ id: "directory-depth-limit", severity: "BLOCKER" }),
    );
  });

  test("fails closed when an explicitly configured source root is missing", async () => {
    const findings: ArchitectureFinding[] = [];
    const files = await collectSourceFiles(root, [], findings, {
      sourceRoots: ["required-source"],
    });
    expect(files).toEqual([]);
    expect(findings).toContainEqual(
      expect.objectContaining({ id: "configured-source-root-missing", severity: "BLOCKER" }),
    );
  });
});
