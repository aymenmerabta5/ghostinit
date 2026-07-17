import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorCommand } from "../../src/commands/doctor";
import { Logger } from "../../src/lib/logger";
import type { GlobalOptions } from "../../src/commands/types";

function makeOptions(cwd: string, overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    cwd,
    json: true,
    yes: false,
    dryRun: false,
    force: false,
    noInstall: false,
    runtime: "bun",
    logger: new Logger({ quiet: true }),
    ...overrides,
  };
}

describe("doctor command", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-doctor-"));
    mkdirSync(join(root, ".ghostinit"), { recursive: true });
    writeFileSync(
      join(root, ".ghostinit", "state.json"),
      JSON.stringify({
        version: 1,
        project: {
          name: "test",
          runtime: "bun",
          version: "0.1.0",
          generatedAt: new Date().toISOString(),
        },
        checksums: {},
        generatedBy: "ghostinit",
        generatedAt: new Date().toISOString(),
        modules: [],
        procedures: [],
      }),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("does not leak BETTER_AUTH_SECRET in JSON output even when present", async () => {
    writeFileSync(
      join(root, ".env"),
      "BETTER_AUTH_SECRET=super_secret_value_12345\nDATABASE_URL=postgresql://user:pass@localhost/db\n",
    );
    process.env.BETTER_AUTH_SECRET = "super_secret_value_12345_super_secret_value_12345";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/db";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    let stdout = "";
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      stdout += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      await doctorCommand([], makeOptions(root));
    } finally {
      process.stdout.write = originalWrite;
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
    }

    expect(stdout).not.toContain("super_secret_value_12345");
    const parsed = JSON.parse(stdout);
    const secretCheck = parsed.data.checks.find(
      (c: { name: string }) => c.name === "secret-strength",
    );
    expect(secretCheck?.ok).toBe(true);
  });
});
