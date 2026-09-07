#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getCapabilityScopedGlobalEnvKeys } from "../src/generation/capability-environment-sanitizer.js";
import { loadDesiredProjectConfig } from "../src/lib/project-config.js";

interface TurboManifest {
  readonly globalEnv?: unknown;
  readonly tasks?: {
    readonly start?: {
      readonly passThroughEnv?: unknown;
    };
  };
}

export interface GeneratedEnvironmentVerification {
  readonly configHash: string;
  readonly count: number;
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

/** Require exact membership, uniqueness, and deterministic manifest order. */
export function assertExactGlobalEnv(actual: readonly string[], expected: readonly string[]): void {
  const duplicates = duplicateValues(actual);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((key) => !actualSet.has(key));
  const unexpected = actual.filter((key) => !expectedSet.has(key));
  const ordered =
    actual.length === expected.length && actual.every((key, index) => key === expected[index]);

  if (duplicates.length === 0 && missing.length === 0 && unexpected.length === 0 && ordered) {
    return;
  }

  throw new Error(
    [
      "turbo.json globalEnv does not exactly match the capability-scoped environment manifest",
      `duplicates: ${duplicates.join(", ") || "none"}`,
      `missing: ${missing.join(", ") || "none"}`,
      `unexpected: ${unexpected.join(", ") || "none"}`,
      `manifest order: ${ordered ? "exact" : "different"}`,
    ].join("\n"),
  );
}

/** Require each emitted dotenv binding to participate in Turbo invalidation or passthrough. */
export function assertEmittedEnvironmentKeysTracked(
  emittedKeys: readonly string[],
  globalEnv: readonly string[],
  passThroughEnv: readonly string[],
): void {
  const trackedInputs = [...globalEnv, ...passThroughEnv];
  const untracked = [...new Set(emittedKeys)].filter(
    (key) =>
      !trackedInputs.some(
        (candidate) =>
          candidate === key || (candidate.endsWith("*") && key.startsWith(candidate.slice(0, -1))),
      ),
  );
  if (untracked.length > 0) {
    throw new Error(`turbo.json does not track emitted environment keys: ${untracked.join(", ")}`);
  }
}

function parseStringArray(value: unknown, label: string, optional = false): string[] {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  const invalidIndexes = value.flatMap((entry, index) =>
    typeof entry === "string" ? [] : [index],
  );
  if (invalidIndexes.length > 0) {
    throw new Error(
      `${label} must contain only strings; invalid indexes: ${invalidIndexes.join(", ")}`,
    );
  }
  return value as string[];
}

function dotenvKeys(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
}

export async function verifyGeneratedEnvironment(
  projectRoot: string,
): Promise<GeneratedEnvironmentVerification> {
  const root = resolve(projectRoot);
  const turbo = JSON.parse(await readFile(join(root, "turbo.json"), "utf8")) as TurboManifest;
  const actual = parseStringArray(turbo.globalEnv, "turbo.json globalEnv");
  const passThroughEnv = parseStringArray(
    turbo.tasks?.start?.passThroughEnv,
    "turbo.json tasks.start.passThroughEnv",
    true,
  );
  const { resolved: config } = await loadDesiredProjectConfig(root);
  const expected = getCapabilityScopedGlobalEnvKeys(config);
  assertExactGlobalEnv(actual, expected);
  const dotenvContents = await Promise.all(
    [".env.example", ".env.local"].map((name) => readFile(join(root, name), "utf8")),
  );
  assertEmittedEnvironmentKeysTracked(dotenvContents.flatMap(dotenvKeys), actual, passThroughEnv);
  return { configHash: config.configHash, count: actual.length };
}

if (import.meta.main) {
  const projectRoot = process.argv[2];
  if (!projectRoot) {
    console.error("Usage: bun ./scripts/verify-generated-env.ts <generated-project-root>");
    process.exitCode = 1;
  } else {
    try {
      const result = await verifyGeneratedEnvironment(projectRoot);
      console.log(
        `[generated-env] turbo.json globalEnv exactly matches ${result.count} capability-scoped manifest keys`,
      );
    } catch (error) {
      console.error(`[generated-env] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
