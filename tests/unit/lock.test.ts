import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
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

  it("renews a live lease so valid long-running work cannot expire", async () => {
    const logger = new Logger({ quiet: true });
    const options = { ttlMs: 90, heartbeatMs: 20, claimTtlMs: 1_000 };
    const first = await acquireLock(root, logger, options);

    try {
      await Bun.sleep(180);
      await expect(acquireLock(root, logger, options)).rejects.toThrow(
        /held by another GhostInit process/,
      );
    } finally {
      await first.release();
    }
  });

  it("takes over a stale legacy lock and emits a unique ownership token", async () => {
    const logger = new Logger({ quiet: true });
    const file = join(root, ".ghostinit.lock");
    writeFileSync(
      file,
      JSON.stringify({ pid: 123, startTime: "2000-01-01T00:00:00.000Z", host: "old-host" }),
    );
    const old = new Date(Date.now() - 5_000);
    utimesSync(file, old, old);

    const acquired = await acquireLock(root, logger, {
      ttlMs: 100,
      heartbeatMs: 20,
      claimTtlMs: 1_000,
    });
    try {
      const diskOwner = JSON.parse(readFileSync(file, "utf8")) as { token?: string };
      expect(acquired.owner.token).toBeString();
      expect(diskOwner.token).toBe(acquired.owner.token);
    } finally {
      await acquired.release();
    }
  });

  it("does not let an old release remove a force-takeover successor", async () => {
    const logger = new Logger({ quiet: true });
    const options = { ttlMs: 1_000, heartbeatMs: 100, claimTtlMs: 1_000 };
    const first = await acquireLock(root, logger, options);
    const successor = await acquireLock(root, logger, { ...options, force: true });

    try {
      await first.release();
      const diskOwner = JSON.parse(readFileSync(join(root, ".ghostinit.lock"), "utf8")) as {
        token?: string;
      };
      expect(diskOwner.token).toBe(successor.owner.token);
    } finally {
      await successor.release();
    }
  });

  it("waits out an abandoned transition when releasing instead of orphaning the lock", async () => {
    const logger = new Logger({ quiet: true });
    const options = { ttlMs: 500, heartbeatMs: 20, claimTtlMs: 60 };
    const held = await acquireLock(root, logger, options);
    const token = randomUUID();
    writeFileSync(
      join(root, ".ghostinit.lock.takeover"),
      JSON.stringify({
        token,
        pid: 999,
        host: "crashed-host",
        startedAt: new Date().toISOString(),
      }),
    );

    await held.release();
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
    expect(existsSync(join(root, ".ghostinit.lock.takeover"))).toBe(false);
  });

  it("allows only one winner when contenders race for a stale lease", async () => {
    const logger = new Logger({ quiet: true });
    const file = join(root, ".ghostinit.lock");
    writeFileSync(
      file,
      JSON.stringify({ pid: 456, startTime: "2000-01-01T00:00:00.000Z", host: "old-host" }),
    );
    const old = new Date(Date.now() - 5_000);
    utimesSync(file, old, old);
    const options = { ttlMs: 100, heartbeatMs: 20, claimTtlMs: 1_000 };

    const results = await Promise.allSettled([
      acquireLock(root, logger, options),
      acquireLock(root, logger, options),
    ]);
    const winners = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireLock>>> =>
        result.status === "fulfilled",
    );
    try {
      expect(winners).toHaveLength(1);
      const diskOwner = JSON.parse(readFileSync(file, "utf8")) as { token?: string };
      expect(diskOwner.token).toBe(winners[0]?.value.owner.token);
    } finally {
      await Promise.all(winners.map(({ value }) => value.release()));
    }
  });

  it("fails closed for a fresh malformed lock instead of deleting it", async () => {
    const logger = new Logger({ quiet: true });
    const file = join(root, ".ghostinit.lock");
    writeFileSync(file, "not-json\n");

    await expect(
      acquireLock(root, logger, { ttlMs: 60_000, heartbeatMs: 1_000, claimTtlMs: 5_000 }),
    ).rejects.toThrow(/held by another GhostInit process/);
    expect(readFileSync(file, "utf8")).toBe("not-json\n");
  });
});
