import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { CLI_OPTIONS } from "../../src/cli/args.js";
import { COMMANDS } from "../../src/cli/registry.js";
import { COMMAND_SPECS } from "../../src/cli/spec.js";
import { ExitCode } from "../../src/lib/errors.js";

const root = resolve(import.meta.dir, "../..");
const ledgerPath = resolve(root, "evidence/compatibility/v1-to-v2.json");
const ledgerSchemaPath = resolve(root, "evidence/compatibility/v1-to-v2.schema.json");
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
  $schema: string;
  version: number;
  sourceVersion: string;
  targetVersion: string;
  commands: Array<{ name: string; status: string }>;
  options: Array<{ name: string; status: string }>;
  exitCodes: Array<{ name: string; value: number; status: string }>;
  capabilities: Record<string, string[]>;
  protocols: Array<{ name: string; status: string; v2: string; reason: string; migration: string }>;
  config: Array<{ name: string; status: string; v2: string; reason: string; migration: string }>;
  upgrade: { name: string; status: string; v2: string; reason: string; migration: string };
};
const ledgerSchema = JSON.parse(readFileSync(ledgerSchemaPath, "utf8"));
const v1Surface = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/compatibility/v1-cli-surface.json"), "utf8"),
) as {
  sourceVersion: string;
  commands: string[];
  options: string[];
  exitCodes: Record<string, number>;
  capabilities: Record<string, string[]>;
};
const v1SurfaceSchema = JSON.parse(
  readFileSync(resolve(root, "tests/fixtures/compatibility/v1-cli-surface.schema.json"), "utf8"),
);

describe("V1-to-V2 compatibility ledger", () => {
  test("is relocated with its schema and bound to the immutable V1 snapshot", () => {
    expect(ledger.$schema).toBe("./v1-to-v2.schema.json");
    expect(existsSync(resolve(ledgerPath, "..", ledger.$schema))).toBe(true);
    expect(ledger.sourceVersion).toBe(v1Surface.sourceVersion);
    expect(ledger.targetVersion).not.toBe(ledger.sourceVersion);
    expect(existsSync(resolve(root, "docs/compatibility/v1-to-v2.json"))).toBe(false);
    expect(existsSync(resolve(root, "docs/compatibility/v1-to-v2.schema.json"))).toBe(false);
  });

  test("covers every V1 command and option exactly once", () => {
    const sourceCommands = ledger.commands
      .filter(({ status }) => status !== "added")
      .map(({ name }) => name)
      .toSorted();
    const sourceOptions = ledger.options
      .filter(({ status }) => status !== "added")
      .map(({ name }) => name)
      .toSorted();
    expect(sourceCommands).toEqual(v1Surface.commands.toSorted());
    expect(sourceOptions).toEqual(v1Surface.options.toSorted());
    const targetCommands = ledger.commands
      .filter(({ status }) => status !== "removed")
      .map(({ name }) => name)
      .toSorted();
    const targetOptions = ledger.options
      .filter(({ status }) => status !== "removed")
      .map(({ name }) => name)
      .toSorted();
    expect(targetCommands).toEqual([...COMMANDS].toSorted());
    expect(targetOptions).toEqual(Object.keys(CLI_OPTIONS).toSorted());
    expect(new Set(ledger.commands.map(({ name }) => name)).size).toBe(ledger.commands.length);
    expect(new Set(ledger.options.map(({ name }) => name)).size).toBe(ledger.options.length);
  });

  test("covers every stable V1 exit code exactly", () => {
    const expectedSource = Object.entries(v1Surface.exitCodes)
      .map(([name, value]) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    const actualSource = ledger.exitCodes
      .filter(({ status }) => status !== "added")
      .map(({ name, value }) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    const expectedTarget = Object.entries(ExitCode)
      .map(([name, value]) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    const actualTarget = ledger.exitCodes
      .filter(({ status }) => status !== "removed")
      .map(({ name, value }) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    expect(actualSource).toEqual(expectedSource);
    expect(actualTarget).toEqual(expectedTarget);
  });

  test("captures every V1 capability axis", () => {
    expect(ledger.capabilities).toEqual(v1Surface.capabilities);
  });

  test("uses only explicit decisions with actionable migration text", () => {
    const items = [
      ...ledger.commands,
      ...ledger.options,
      ...ledger.exitCodes,
      ...ledger.protocols,
      ...ledger.config,
      ledger.upgrade,
    ] as Array<{
      status: string;
      v2?: string | null;
      reason?: string;
      migration?: string;
    }>;
    for (const item of items) {
      expect(["retained", "changed", "deprecated", "removed", "added"]).toContain(item.status);
      expect(item.reason?.trim().length).toBeGreaterThan(0);
      expect(item.migration?.trim().length).toBeGreaterThan(0);
      if (item.status === "removed") expect(item.v2).toBeNull();
      else expect(typeof item.v2 === "string" && item.v2.length > 0).toBe(true);
    }
  });

  test("uses unique names and non-empty capability axes throughout", () => {
    const namedSections = [
      ledger.commands,
      ledger.options,
      ledger.exitCodes,
      ledger.protocols,
      ledger.config,
    ];
    for (const section of namedSections) {
      expect(section.length).toBeGreaterThan(0);
      expect(new Set(section.map(({ name }) => name)).size).toBe(section.length);
    }
    expect(new Set(ledger.exitCodes.map(({ value }) => value)).size).toBe(ledger.exitCodes.length);
    for (const [axis, values] of Object.entries(ledger.capabilities)) {
      expect(values.length, axis).toBeGreaterThan(0);
      expect(new Set(values).size, axis).toBe(values.length);
    }
  });

  test("validates against the committed Draft 2020-12 schema", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(ledgerSchema);
    expect(validate(ledger), JSON.stringify(validate.errors)).toBe(true);
    const validateFixture = ajv.compile(v1SurfaceSchema);
    expect(validateFixture(v1Surface), JSON.stringify(validateFixture.errors)).toBe(true);
  });

  test("declares option applicability for every executable V2 command", () => {
    expect(Object.keys(COMMAND_SPECS).toSorted()).toEqual([...COMMANDS].toSorted());
    for (const spec of Object.values(COMMAND_SPECS)) {
      expect(new Set(spec.options).size).toBe(spec.options.length);
      for (const option of spec.options) expect(Object.hasOwn(CLI_OPTIONS, option)).toBe(true);
    }
    for (const option of Object.keys(CLI_OPTIONS)) {
      expect(
        Object.values(COMMAND_SPECS).some((spec) =>
          (spec.options as readonly string[]).includes(option),
        ),
        option,
      ).toBe(true);
    }
  });
});
