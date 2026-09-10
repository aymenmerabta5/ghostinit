import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rm, rmdir, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { acquireLock } from "../../src/lib/lock.js";
import { Logger } from "../../src/lib/logger.js";

const journalPath = ".ghostinit/security-installation.json";

describe("mutation lease recovery admission", () => {
  let root: string;
  let outside: string;
  const logger = new Logger({ quiet: true });
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "ghostinit-lock-admission-"));
    outside = await mkdtemp(join(tmpdir(), "ghostinit-lock-admission-outside-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  async function write(path: string, content: string, target = root): Promise<void> {
    const tx = new FsTransaction(target);
    await tx.write(path, content);
    await tx.commit();
  }

  it("rejects cleanup-unverified journals before creating a lease or transition claim", async () => {
    const content = JSON.stringify({ schemaVersion: 1, status: "CLEANUP_UNVERIFIED" });
    await write(journalPath, content);
    await expect(acquireLock(root, logger)).rejects.toThrow("unverified cleanup");
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
    expect(existsSync(join(root, ".ghostinit.lock.takeover"))).toBe(false);
    expect(await readFile(join(root, journalPath), "utf8")).toBe(content);
  });

  it("does not let force or lease expiry bypass persisted cleanup failure", async () => {
    const oldOwner = JSON.stringify({
      pid: 123,
      startTime: "2000-01-01T00:00:00.000Z",
      host: "old-host",
    });
    await write(".ghostinit.lock", oldOwner);
    const old = new Date(Date.now() - 60_000);
    await utimes(join(root, ".ghostinit.lock"), old, old);
    await write(journalPath, JSON.stringify({ schemaVersion: 1, status: "CLEANUP_UNVERIFIED" }));
    for (const force of [false, true]) {
      await expect(
        acquireLock(root, logger, { force, ttlMs: 100, heartbeatMs: 20, claimTtlMs: 1_000 }),
      ).rejects.toThrow("unverified cleanup");
      expect(await readFile(join(root, ".ghostinit.lock"), "utf8")).toBe(oldOwner);
    }
  });

  it("admits ordinary retryable journals and leaves lease release usable", async () => {
    for (const status of ["INSTALLING", "FAILED"]) {
      await write(journalPath, JSON.stringify({ schemaVersion: 1, status }));
      const lease = await acquireLock(root, logger);
      expect(existsSync(join(root, ".ghostinit.lock"))).toBe(true);
      // A failure marker can appear while this owner holds the lease. Admission
      // must not obstruct the owner's explicit release transition.
      await write(journalPath, JSON.stringify({ schemaVersion: 1, status: "CLEANUP_UNVERIFIED" }));
      await lease.release();
      expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
    }
  });

  it("rejects malformed, ambiguous and oversized journal contents", async () => {
    for (const content of [
      "not-json",
      '{"status":"CLEANUP_UNVERIFIED","sta\\u0074us":"FAILED"}',
      JSON.stringify({ status: "unrecognized" }),
      JSON.stringify({ status: "FAILED", extra: "x".repeat(17_000) }),
    ]) {
      await write(journalPath, content);
      await expect(acquireLock(root, logger, { force: true })).rejects.toThrow(
        "regular recovery journal",
      );
      expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
    }
  });

  it("does not follow a linked journal, linked metadata directory, or shared journal inode", async () => {
    await write("journal.json", JSON.stringify({ status: "FAILED" }), outside);
    await mkdir(join(root, ".ghostinit"));
    await symlink(join(outside, "journal.json"), join(root, journalPath), "file");
    await expect(acquireLock(root, logger)).rejects.toThrow("regular recovery journal");
    await rm(join(root, journalPath));
    await link(join(outside, "journal.json"), join(root, journalPath));
    await expect(acquireLock(root, logger)).rejects.toThrow("regular recovery journal");
    await rm(join(root, journalPath));
    await rmdir(join(root, ".ghostinit"));
    await symlink(
      outside,
      join(root, ".ghostinit"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(acquireLock(root, logger)).rejects.toThrow("regular recovery journal");
    expect(await readFile(join(outside, "journal.json"), "utf8")).toBe(
      JSON.stringify({ status: "FAILED" }),
    );
  });
});
