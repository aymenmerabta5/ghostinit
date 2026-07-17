import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock } from "../../src/lib/lock";
import { Logger } from "../../src/lib/logger";

describe("acquireLock", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-lock-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates a lock file and releases it", async () => {
    const logger = new Logger({ quiet: true });
    const { release } = await acquireLock(root, logger);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(true);
    await release();
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  it("throws when a lock is already held and force is false", async () => {
    const logger = new Logger({ quiet: true });
    const first = await acquireLock(root, logger);
    await expect(acquireLock(root, logger)).rejects.toThrow();
    await first.release();
  });
});
