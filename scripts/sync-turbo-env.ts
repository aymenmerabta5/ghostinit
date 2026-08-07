/**
 * Sync host turbo.json globalEnv from src/lib/env-manifest.ts SSOT.
 * Usage: bun run scripts/sync-turbo-env.ts  (or --check for CI)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getGlobalEnvKeys } from "../src/lib/env-manifest.ts";

const turboPath = resolve(import.meta.dirname ?? ".", "../turbo.json");
const raw = readFileSync(turboPath, "utf-8");
const parsed = JSON.parse(raw) as { globalEnv: string[]; [k: string]: unknown };

const expected = getGlobalEnvKeys("bun");
const actual = parsed.globalEnv;

const isCheck = process.argv.includes("--check");

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  if (isCheck) {
    console.error("turbo.json globalEnv drift detected!");
    console.error(`Expected ${expected.length} keys, got ${actual.length}`);
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k));
    if (missing.length) console.error("Missing:", missing);
    if (extra.length) console.error("Extra:", extra);
    process.exit(1);
  } else {
    parsed.globalEnv = expected;
    writeFileSync(turboPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
    console.log(`Synced turbo.json globalEnv: ${expected.length} keys`);
  }
} else {
  console.log(`turbo.json globalEnv in sync: ${expected.length} keys`);
}
