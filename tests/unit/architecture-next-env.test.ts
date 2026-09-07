import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { createImportResolver } from "../../src/lib/architecture/resolution/index.js";
import type { ImportReference } from "../../src/lib/architecture/types.js";

const NEXT_ENV = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";
import "./.next/types/root-params.d.ts";
`;

describe("Next framework-generated type references", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-next-env-"));
    json("package.json", {
      name: "single-next",
      private: true,
      workspaces: ["apps/*"],
      dependencies: { next: "16.3.0" },
    });
    json("apps/web/package.json", {
      name: "web",
      private: true,
      dependencies: { next: "16.3.0" },
    });
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function file(path: string, content = "export {};\n"): void {
    const target = join(root, ...path.split("/"));
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  function json(path: string, value: unknown): void {
    file(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  function reference(specifier: string): ImportReference {
    return {
      specifier,
      kind: "import",
      typeOnly: false,
      location: {
        start: 0,
        end: specifier.length,
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: specifier.length + 1,
      },
    };
  }

  test("recognizes the exact Next 16.3 next-env imports in single and monorepo apps", async () => {
    file("next-env.d.ts", NEXT_ENV);
    file("apps/web/next-env.d.ts", NEXT_ENV);
    for (const generatedType of ["routes", "root-params"]) {
      file(`.next/types/${generatedType}.d.ts`);
      file(`apps/web/.next/types/${generatedType}.d.ts`);
    }
    const resolver = await createImportResolver(root);

    for (const source of ["next-env.d.ts", "apps/web/next-env.d.ts"]) {
      for (const generatedType of ["routes", "root-params"]) {
        expect(
          await resolver.resolve(
            join(root, ...source.split("/")),
            reference(`./.next/types/${generatedType}.d.ts`),
          ),
        ).toMatchObject({ kind: "generated", reason: "generated-next-types" });
      }
    }
  });

  test("does not report blockers for the post-build Next-owned declarations", async () => {
    file("next-env.d.ts", NEXT_ENV);
    file("apps/web/next-env.d.ts", NEXT_ENV);
    for (const generatedType of ["routes", "root-params"]) {
      file(`.next/types/${generatedType}.d.ts`);
      file(`apps/web/.next/types/${generatedType}.d.ts`);
    }

    const report = await analyzeProjectReport(root);
    expect(report.findings.filter(({ severity }) => severity === "BLOCKER")).toEqual([]);
  });

  test("does not exempt lookalike imports from user-owned source", async () => {
    file("next-env.d.ts", NEXT_ENV);
    file("apps/web/next-env.d.ts", NEXT_ENV);
    file("src/user.ts", 'import "../.next/types/routes.d.ts";\n');
    file("apps/web/src/user.ts", 'import "../.next/types/routes.d.ts";\n');

    const report = await analyzeProjectReport(root);
    const unresolved = report.findings
      .filter(({ id }) => id === "unresolved-owned-import")
      .map(({ file: path, specifier }) => [path, specifier]);

    expect(unresolved).toEqual([
      ["apps/web/src/user.ts", "../.next/types/routes.d.ts"],
      ["src/user.ts", "../.next/types/routes.d.ts"],
    ]);
  });
});
