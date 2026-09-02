// @allow-long 380: resolver matrix keeps cross-strategy fallthrough regressions in one fixture harness
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createImportResolver } from "../../src/lib/architecture/resolution/index.js";
import type { ImportKind, ImportReference } from "../../src/lib/architecture/types.js";

describe("architecture import resolution", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-resolution-"));
    json("package.json", {
      name: "fixture-root",
      private: true,
      workspaces: ["apps/*", "packages/*", "tooling/*"],
    });
    json("apps/web/package.json", { name: "web", private: true });
    file("apps/web/src/index.ts", "export {};\n");
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function file(path: string, content = "export {};\n"): void {
    const target = join(root, ...path.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  function json(path: string, value: unknown): void {
    file(path, JSON.stringify(value, null, 2));
  }

  function reference(
    specifier: string,
    start = 0,
    kind: ImportKind = "import",
    typeOnly = false,
  ): ImportReference {
    return {
      specifier,
      kind,
      typeOnly,
      location: {
        start,
        end: start + specifier.length,
        line: 1,
        column: start + 1,
        endLine: 1,
        endColumn: start + specifier.length + 1,
      },
    };
  }

  test("resolves relative files, directories, ESM source substitutions, and exact assets", async () => {
    file("apps/web/src/value.ts");
    file("apps/web/src/directory/index.tsx");
    file("apps/web/src/esm.ts");
    file("apps/web/src/create-checkout.service.ts");
    file("apps/web/src/theme.css", "body {}\n");
    json("apps/web/src/data.json", { ok: true });
    json("apps/web/src/entry/package.json", { module: "./main.js" });
    file("apps/web/src/entry/main.ts");
    const resolver = await createImportResolver(root);
    const source = join(root, "apps/web/src/index.ts");

    const results = await resolver.resolveAll(source, [
      reference("./value?raw#ignored", 1),
      reference("./directory", 2),
      reference("./esm.js", 3),
      reference("./theme.css?url", 4),
      reference("./data.json#fragment", 5),
      reference("./entry", 6),
      reference("./create-checkout.service", 7),
    ]);

    expect(results.map(({ target }) => target)).toEqual([
      "apps/web/src/value.ts",
      "apps/web/src/directory/index.tsx",
      "apps/web/src/esm.ts",
      "apps/web/src/theme.css",
      "apps/web/src/data.json",
      "apps/web/src/entry/main.ts",
      "apps/web/src/create-checkout.service.ts",
    ]);
    expect(
      results.every(({ kind, reason }) => kind === "internal" && reason === "relative-file"),
    ).toBe(true);
  });

  test("keeps missing relative and escaping targets owned and deterministic", async () => {
    const resolver = await createImportResolver(root);
    const source = join(root, "apps/web/src/index.ts");
    const missing = await resolver.resolve(source, reference("./missing"));
    const outside = await resolver.resolve(source, reference("../../../../outside"));

    expect(missing).toMatchObject({
      kind: "unresolved",
      owned: true,
      reason: "relative-target-missing",
      target: "apps/web/src/missing",
    });
    expect(outside).toMatchObject({
      kind: "unresolved",
      owned: true,
      reason: "target-outside-project",
    });
    expect(JSON.stringify([missing, outside])).not.toContain(root);
  });

  test("loads JSONC tsconfig paths through package extends and honors fallback targets", async () => {
    json("tooling/config/package.json", { name: "@repo/typescript-config", private: true });
    file(
      "tooling/config/base.json",
      `{
        // aliases are relative to this extended config
        "compilerOptions": {
          "baseUrl": "../..",
          "paths": { "@shared/*": ["absent/*", "shared/*"], },
        },
      }`,
    );
    json("apps/web/tsconfig.json", { extends: "@repo/typescript-config/base.json" });
    file("shared/tool.ts");
    const resolver = await createImportResolver(root);
    const source = join(root, "apps/web/src/index.ts");

    const alias = await resolver.resolve(source, reference("@shared/tool"));
    const baseUrl = await resolver.resolve(source, reference("shared/tool"));
    const missing = await resolver.resolve(source, reference("@shared/absent"));
    expect(alias).toMatchObject({
      kind: "internal",
      reason: "tsconfig-path",
      target: "shared/tool.ts",
    });
    expect(baseUrl).toMatchObject({
      kind: "internal",
      reason: "tsconfig-base-url",
      target: "shared/tool.ts",
    });
    expect(missing).toMatchObject({
      kind: "unresolved",
      owned: true,
      reason: "tsconfig-path-target-missing",
      target: "absent/absent",
    });
  });

  test("resolves package imports and does not externalize missing or blocked aliases", async () => {
    json("apps/web/package.json", {
      name: "web",
      imports: {
        "#lib/*": "./src/lib/*.js",
        "#blocked": null,
        "#external": "react",
      },
    });
    file("apps/web/src/lib/helper.ts");
    const resolver = await createImportResolver(root);
    const source = join(root, "apps/web/src/index.ts");

    expect(await resolver.resolve(source, reference("#lib/helper?raw"))).toMatchObject({
      kind: "internal",
      reason: "package-import",
      target: "apps/web/src/lib/helper.ts",
    });
    expect(await resolver.resolve(source, reference("#missing"))).toMatchObject({
      kind: "unresolved",
      owned: true,
      reason: "package-import-not-defined",
    });
    expect(await resolver.resolve(source, reference("#blocked"))).toMatchObject({
      kind: "unresolved",
      reason: "package-import-blocked",
    });
    expect(await resolver.resolve(source, reference("#external"))).toMatchObject({
      kind: "external",
      packageName: "react",
    });
  });

  test("resolves workspace exports, conditions, wildcards, assets, and self references", async () => {
    json("packages/library/package.json", {
      name: "@repo/library",
      exports: {
        ".": { types: "./src/types.d.ts", import: "./src/index.ts" },
        "./features/*": "./src/features/*.ts",
        "./theme.css": "./src/theme.css",
        "./blocked": null,
      },
    });
    file("packages/library/src/index.ts");
    file("packages/library/src/types.d.ts");
    file("packages/library/src/features/admin.ts");
    file("packages/library/src/theme.css", ":root {}\n");
    const resolver = await createImportResolver(root);
    const web = join(root, "apps/web/src/index.ts");

    expect(await resolver.resolve(web, reference("@repo/library"))).toMatchObject({
      kind: "workspace",
      reason: "workspace-export",
      target: "packages/library/src/index.ts",
    });
    expect(
      await resolver.resolve(web, reference("@repo/library", 0, "import", true)),
    ).toMatchObject({
      target: "packages/library/src/types.d.ts",
    });
    expect(await resolver.resolve(web, reference("@repo/library/features/admin"))).toMatchObject({
      target: "packages/library/src/features/admin.ts",
    });
    expect(await resolver.resolve(web, reference("@repo/library/theme.css"))).toMatchObject({
      target: "packages/library/src/theme.css",
    });
    expect(await resolver.resolve(web, reference("@repo/library/unknown"))).toMatchObject({
      kind: "unresolved",
      owned: true,
      reason: "workspace-export-not-defined",
    });
    expect(await resolver.resolve(web, reference("@repo/libary"))).toMatchObject({
      kind: "unresolved",
      owned: true,
      reason: "workspace-package-not-found",
    });
    expect(await resolver.resolve(web, reference("@repo/library/blocked"))).toMatchObject({
      reason: "workspace-export-blocked",
    });
    const self = join(root, "packages/library/src/index.ts");
    expect(await resolver.resolve(self, reference("@repo/library/features/admin"))).toMatchObject({
      kind: "workspace",
      reason: "self-reference",
    });
  });

  test("falls through a missing broad tsconfig path target to workspace exports", async () => {
    json("apps/web/tsconfig.json", {
      compilerOptions: { paths: { "@repo/*": ["../../packages/*/src"] } },
    });
    json("packages/api/package.json", {
      name: "@repo/api",
      exports: { "./openapi": "./src/openapi.ts" },
    });
    json("packages/analytics/package.json", {
      name: "@repo/analytics",
      exports: { "./client": "./src/client/index.ts" },
    });
    file("packages/api/src/openapi.ts");
    file("packages/analytics/src/client/index.ts");
    const resolver = await createImportResolver(root);
    const source = join(root, "apps/web/src/index.ts");

    expect(await resolver.resolve(source, reference("@repo/api/openapi"))).toMatchObject({
      kind: "workspace",
      reason: "workspace-export",
      target: "packages/api/src/openapi.ts",
    });
    expect(await resolver.resolve(source, reference("@repo/analytics/client"))).toMatchObject({
      kind: "workspace",
      target: "packages/analytics/src/client/index.ts",
    });
  });

  test("classifies Node, Bun, npm, and URL imports without filesystem guesses", async () => {
    const resolver = await createImportResolver(root);
    const source = join(root, "apps/web/src/index.ts");
    const results = await resolver.resolveAll(source, [
      reference("node:fs/promises", 1),
      reference("path", 2),
      reference("bun:test", 3),
      reference("react/jsx-runtime", 4),
      reference("https://example.test/module.ts", 5),
    ]);
    expect(results.map(({ kind }) => kind)).toEqual([
      "builtin",
      "builtin",
      "builtin",
      "external",
      "external",
    ]);
    expect(results[3]).toMatchObject({ packageName: "react", reason: "external-package" });
  });

  test("resolves Convex bootstrap files without masking declaration-only runtime imports", async () => {
    file("packages/service/src/worker.ts");
    file("convex/_generated/api.d.ts", "export declare const api: unknown;\n");
    file("convex/_generated/api.js", "export const api = {};\n");
    file("convex/_generated/dataModel.d.ts", "export interface DataModel {}\n");
    file("convex/_generated/dataModel.js", "export const DataModel = {};\n");
    file("convex/_generated/server.d.ts", "export declare const query: unknown;\n");
    file("apps/web/src/router.ts");
    const resolver = await createImportResolver(root);

    expect(
      await resolver.resolve(
        join(root, "packages/service/src/worker.ts"),
        reference("../../../convex/_generated/api"),
      ),
    ).toMatchObject({
      kind: "internal",
      reason: "relative-file",
      target: "convex/_generated/api.js",
    });
    expect(
      await resolver.resolve(
        join(root, "packages/service/src/worker.ts"),
        reference("../../../convex/_generated/dataModel", 0, "import", true),
      ),
    ).toMatchObject({
      kind: "internal",
      reason: "relative-file",
      target: "convex/_generated/dataModel.d.ts",
    });
    expect(
      await resolver.resolve(
        join(root, "packages/service/src/worker.ts"),
        reference("../../../convex/_generated/dataModel"),
      ),
    ).toMatchObject({
      kind: "internal",
      reason: "relative-file",
      target: "convex/_generated/dataModel.js",
    });
    expect(
      await resolver.resolve(
        join(root, "packages/service/src/worker.ts"),
        reference("../../../convex/_generated/server"),
      ),
    ).toMatchObject({
      kind: "unresolved",
      reason: "relative-target-missing",
      target: "convex/_generated/server",
    });
  });

  test("allows only the sibling generated route tree target", async () => {
    file("packages/service/src/worker.ts");
    file("apps/web/src/router.ts");
    const resolver = await createImportResolver(root);

    expect(
      await resolver.resolve(join(root, "apps/web/src/router.ts"), reference("./routeTree.gen")),
    ).toMatchObject({ kind: "generated", reason: "generated-route-tree" });

    for (const lookalike of [
      "../convex/_generated/api",
      "../../../convex/_generated/client",
      "../routeTree.gen",
      "./nested/routeTree.gen",
    ]) {
      const source = lookalike.includes("routeTree")
        ? join(root, "apps/web/src/router.ts")
        : join(root, "packages/service/src/worker.ts");
      expect(await resolver.resolve(source, reference(lookalike))).toMatchObject({
        kind: "unresolved",
        reason: "relative-target-missing",
      });
    }
  });

  test("sorts repeated references by source location without deduplicating them", async () => {
    file("apps/web/src/value.ts");
    const resolver = await createImportResolver(root);
    const results = await resolver.resolveAll(join(root, "apps/web/src/index.ts"), [
      reference("./value", 20, "dynamic-import"),
      reference("./value", 3, "reexport"),
      reference("./value", 10, "require"),
    ]);
    expect(results.map(({ reference: item }) => [item.location.start, item.kind])).toEqual([
      [3, "reexport"],
      [10, "require"],
      [20, "dynamic-import"],
    ]);
  });
});
