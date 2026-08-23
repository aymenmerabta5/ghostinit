import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { CLI_OPTIONS } from "../../src/cli/args.js";
import { COMMANDS } from "../../src/cli/registry.js";
import { ExitCode } from "../../src/lib/errors.js";
import { BILLING_PROVIDERS, CACHE_PROVIDERS, PRESETS } from "../../src/lib/constants.js";
import {
  availableApps,
  availableDatabases,
  availableDeployTargets,
  availableFeatures,
  availableFrameworks,
  availableModes,
  availableStacks,
} from "../../src/lib/addons.js";

const root = resolve(import.meta.dir, "../..");
const ledger = JSON.parse(
  readFileSync(resolve(root, "docs/compatibility/v1-to-v2.json"), "utf8"),
) as {
  version: number;
  commands: Array<{ name: string; status: string }>;
  options: Array<{ name: string; status: string }>;
  exitCodes: Array<{ name: string; value: number; status: string }>;
  capabilities: Record<string, string[]>;
};
const ledgerSchema = JSON.parse(
  readFileSync(resolve(root, "docs/compatibility/v1-to-v2.schema.json"), "utf8"),
);

describe("V1-to-V2 compatibility ledger", () => {
  test("covers every V1 command and option exactly once", () => {
    const sourceCommands = ledger.commands
      .filter(({ status }) => status !== "added")
      .map(({ name }) => name)
      .toSorted();
    const sourceOptions = ledger.options
      .filter(({ status }) => status !== "added")
      .map(({ name }) => name)
      .toSorted();
    expect(sourceCommands).toEqual([...COMMANDS].toSorted());
    expect(sourceOptions).toEqual(Object.keys(CLI_OPTIONS).toSorted());
    expect(new Set(ledger.commands.map(({ name }) => name)).size).toBe(ledger.commands.length);
    expect(new Set(ledger.options.map(({ name }) => name)).size).toBe(ledger.options.length);
  });

  test("covers every stable V1 exit code exactly", () => {
    const expected = Object.entries(ExitCode)
      .map(([name, value]) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    const actual = ledger.exitCodes
      .map(({ name, value }) => ({ name, value }))
      .toSorted((a, b) => a.value - b.value || a.name.localeCompare(b.name));
    expect(actual).toEqual(expected);
  });

  test("captures every V1 capability axis", () => {
    expect(ledger.capabilities).toEqual({
      modes: [...availableModes],
      frameworks: [...availableFrameworks],
      apps: [...availableApps],
      databases: [...availableDatabases],
      billingProviders: [...BILLING_PROVIDERS],
      features: [...availableFeatures],
      presets: [...PRESETS],
      cacheProviders: [...CACHE_PROVIDERS],
      deployTargets: [...availableDeployTargets],
      stacks: [...availableStacks],
    });
  });

  test("uses only explicit decisions with actionable migration text", () => {
    const items = [...ledger.commands, ...ledger.options, ...ledger.exitCodes] as Array<{
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

  test("validates against the committed Draft 2020-12 schema", () => {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(ledgerSchema);
    expect(validate(ledger), JSON.stringify(validate.errors)).toBe(true);
  });
});
