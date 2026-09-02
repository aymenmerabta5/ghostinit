import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { redact as redactHost } from "../../src/lib/logger.js";
import {
  observabilityConstantsContent,
  observabilityLoggerContent,
} from "../../src/templates/packages/observability-logger.js";
import { serverObservabilitySingle } from "../../src/templates/modes/single/server/db.js";

type Redact = (value: unknown, key?: string) => unknown;

let root = "";
let generatedRedactors: Array<[string, Redact]> = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "ghostinit-generated-logger-"));
  const monorepo = join(root, "monorepo");
  mkdirSync(monorepo, { recursive: true });
  writeFileSync(join(monorepo, "constants.ts"), observabilityConstantsContent(), "utf8");
  writeFileSync(
    join(monorepo, "logger.ts"),
    observabilityLoggerContent().replace('from "./constants.js"', 'from "./constants.ts"'),
    "utf8",
  );
  writeFileSync(join(root, "single.ts"), serverObservabilitySingle(), "utf8");

  const monorepoModule = await import(pathToFileURL(join(monorepo, "logger.ts")).href);
  const singleModule = await import(pathToFileURL(join(root, "single.ts")).href);
  generatedRedactors = [
    ["host", redactHost],
    ["monorepo", monorepoModule.redact as Redact],
    ["single", singleModule.redact as Redact],
  ];
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("generated logger secret hygiene", () => {
  test("redacts secret-classified keys consistently in every generated mode", () => {
    for (const [name, redact] of generatedRedactors) {
      const output = redact({ database_url: "opaque-value-that-must-not-leak" });
      expect(output, `${name} did not redact database_url`).toEqual({ database_url: "***" });
    }
  });

  test("redacts opaque credentials embedded in arbitrary URL and string text", () => {
    const input =
      "upstream failed: https://alice:inline-password-value@example.test/callback?token=inline-query-value&status=ok; client_secret=loose-secret-value";

    for (const [name, redact] of generatedRedactors) {
      const output = String(redact(input, "message"));
      for (const secret of [
        "alice",
        "inline-password-value",
        "inline-query-value",
        "loose-secret-value",
      ]) {
        expect(output, `${name} leaked ${secret}`).not.toContain(secret);
      }
      expect(output).toContain("status=ok");
    }
  });
});
