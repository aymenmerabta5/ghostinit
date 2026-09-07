import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PORTABLE_NAME_MAX_UTF8_BYTES } from "../../src/domain/project/choices.js";

const CLI = resolve(import.meta.dir, "../../dist/cli.js");

describe("portable CLI name validation", () => {
  let root = "";
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-portable-name-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects device and overlong names before touching their destinations", () => {
    const names = ["con", "nul", "com1", "lpt9", "a".repeat(PORTABLE_NAME_MAX_UTF8_BYTES + 1)];
    for (const name of names) {
      const result = Bun.spawnSync({
        cmd: [process.execPath, CLI, "create", name, "--cwd", root, "--no-install", "--json"],
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode, name).toBe(17);
      const payload = JSON.parse(result.stdout.toString()) as {
        success: boolean;
        error?: { code?: string };
      };
      expect(payload.success, name).toBe(false);
      expect(payload.error?.code, name).toBe("VALIDATION_ERROR");
      expect(existsSync(join(root, name)), name).toBe(false);
    }
  });
});
