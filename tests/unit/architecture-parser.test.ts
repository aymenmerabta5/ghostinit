import { describe, expect, test } from "bun:test";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";

describe("architecture import parser", () => {
  test("keeps legacy imports deduplicated while preserving ordered structured references", () => {
    const source = [
      '"use client";',
      'const first = require("shared");',
      'import type { Alpha } from "types-only";',
      'export { type Beta } from "reexport-types";',
      'import Legacy = require("legacy");',
      'async function load() { return import("dynamic"); }',
      'const duplicate = require("shared");',
    ].join("\n");

    const parsed = parseFile(source, ".ts");

    expect(parsed.imports).toEqual(["shared", "types-only", "reexport-types", "legacy", "dynamic"]);
    expect(parsed.directives).toEqual(new Set(["use client"]));
    expect(
      parsed.importReferences.map(({ specifier, kind, typeOnly }) => ({
        specifier,
        kind,
        typeOnly,
      })),
    ).toEqual([
      { specifier: "shared", kind: "require", typeOnly: false },
      { specifier: "types-only", kind: "import", typeOnly: true },
      { specifier: "reexport-types", kind: "reexport", typeOnly: true },
      { specifier: "legacy", kind: "import-equals", typeOnly: false },
      { specifier: "dynamic", kind: "dynamic-import", typeOnly: false },
      { specifier: "shared", kind: "require", typeOnly: false },
    ]);

    for (const reference of parsed.importReferences) {
      const { start, end, line, column, endLine, endColumn } = reference.location;
      expect(source.slice(start, end)).toContain(reference.specifier);
      expect(line).toBeGreaterThanOrEqual(1);
      expect(column).toBeGreaterThanOrEqual(1);
      expect(endLine).toBeGreaterThanOrEqual(line);
      expect(endColumn).toBeGreaterThanOrEqual(1);
    }
    expect(parsed.importReferences[0]?.location).toMatchObject({ line: 2, column: 15 });
  });

  test("marks a reference type-only only when the whole import or re-export is type-only", () => {
    const parsed = parseFile(
      [
        'import { type A } from "inline-import-type";',
        'import { type B, C } from "mixed-import";',
        'export type * from "all-type";',
        'export { type D } from "inline-export-type";',
        'export { type E, F } from "mixed-export";',
        'import type Alias = require("type-equals");',
      ].join("\n"),
      ".ts",
    );

    expect(parsed.importReferences.map(({ specifier, typeOnly }) => [specifier, typeOnly])).toEqual(
      [
        ["inline-import-type", true],
        ["mixed-import", false],
        ["all-type", true],
        ["inline-export-type", true],
        ["mixed-export", false],
        ["type-equals", true],
      ],
    );
  });

  test.each([
    [".ts", 'import type { A } from "ts-dep";', "ts-dep", "import"],
    [".tsx", 'import React from "tsx-dep"; export const el = <div />;', "tsx-dep", "import"],
    [".js", 'export { value } from "js-dep";', "js-dep", "reexport"],
    [".jsx", 'import React from "jsx-dep"; export const el = <div />;', "jsx-dep", "import"],
    [".mts", 'const module = import("mts-dep");', "mts-dep", "dynamic-import"],
    [".cts", 'import legacy = require("cts-dep");', "cts-dep", "import-equals"],
    [".mjs", 'import value from "mjs-dep";', "mjs-dep", "import"],
    [".cjs", 'const value = require("cjs-dep");', "cjs-dep", "require"],
  ] as const)("parses %s using its actual language mode", (ext, source, specifier, kind) => {
    const parsed = parseFile(source, ext);

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.imports).toEqual([specifier]);
    expect(parsed.importReferences).toHaveLength(1);
    expect(parsed.importReferences[0]).toMatchObject({ specifier, kind });
  });

  test("collects only literal require and dynamic import specifiers", () => {
    const parsed = parseFile(
      [
        'require("literal-require");',
        "require(variable);",
        "require(`template-require`);",
        'object.require("member-require");',
        'import("literal-dynamic");',
        "import(variable);",
        "import(`template-dynamic`);",
      ].join("\n"),
      ".js",
    );

    expect(parsed.imports).toEqual(["literal-require", "literal-dynamic"]);
    expect(parsed.importReferences.map(({ kind }) => kind)).toEqual(["require", "dynamic-import"]);
  });

  test("recognizes directives only in the leading directive prologue", () => {
    const parsed = parseFile(
      `'use strict';\nconst value = true;\n'use client';\nexport { value };`,
      ".ts",
    );
    expect(parsed.directives).toEqual(new Set());
  });

  test("exposes parser diagnostics instead of silently discarding them", () => {
    const parsed = parseFile('const broken: = 1;\nimport value from "after-error";', ".ts");

    expect(parsed.diagnostics.length).toBeGreaterThan(0);
    const diagnostic = parsed.diagnostics[0];
    expect(diagnostic).toMatchObject({
      severity: "Error",
      message: expect.any(String),
      labels: expect.any(Array),
      helpMessage: null,
      codeframe: expect.any(String),
    });
    expect(diagnostic?.labels).toEqual([{ message: null, start: 14, end: 15 }]);
  });
});
