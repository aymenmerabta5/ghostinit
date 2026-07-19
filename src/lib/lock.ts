/**
 * Atomic project lock with stale-lock detection.
 *
 * The lock file is created with O_EXCL. A lock older than a configurable TTL
 * is considered stale and can be overwritten (unless force is disabled).
 */

import { hostname } from "node:os";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { LockError } from "./errors.js";
import type { Logger } from "./logger.js";

export interface LockOwner {
  pid: number;
  startTime: string;
  host?: string;
}

export interface LockOptions {
  ttlMs?: number;
  force?: boolean;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_FILE_NAME = ".ghostinit.lock";

export function lockPath(root: string): string {
  return join(root, LOCK_FILE_NAME);
}

function resolveHost(): string {
  try {
    return process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? hostname();
  } catch {
    return process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown";
  }
}

export async function acquireLock(
  root: string,
  logger: Logger,
  options: LockOptions = {},
): Promise<{ release: () => Promise<void>; owner: LockOwner }> {
  const file = lockPath(root);
  await mkdir(root, { recursive: true });

  const owner: LockOwner = {
    pid: process.pid,
    startTime: new Date().toISOString(),
    host: resolveHost(),
  };

  const content = JSON.stringify(owner, null, 2);

  // Try to create the lock exclusively.
  try {
    const handle = await open(file, "wx", 0o644);
    await handle.writeFile(content, "utf-8");
    await handle.close();
  } catch {
    const existing = await readExistingLock(file);
    const stale = await isStale(file, options.ttlMs ?? DEFAULT_TTL_MS);

    if (existing && !stale && !options.force) {
      throw new LockError("Project lock is held by another GhostInit process", {
        lockFile: file,
        owner: existing,
      });
    }

    if (!options.force) {
      logger.warn("Existing lock is stale; overwriting", { file, existing });
    }

    try {
      await rm(file, { force: true });
      const handle = await open(file, "wx", 0o644);
      await handle.writeFile(content, "utf-8");
      await handle.close();
    } catch (err) {
      throw new LockError("Unable to acquire project lock", { cause: String(err) });
    }
  }

  async function release(): Promise<void> {
    try {
      const current = await readFile(file, "utf-8");
      const parsed = JSON.parse(current) as LockOwner;
      const sameHost = parsed.host === owner.host || (!parsed.host && !owner.host);
      if (parsed.pid === owner.pid && sameHost) {
        await rm(file, { force: true });
      }
    } catch {
      // Lock already released or corrupted; ignore.
    }
  }

  return { release, owner };
}

async function readExistingLock(file: string): Promise<LockOwner | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as LockOwner;
  } catch {
    return undefined;
  }
}

async function isStale(file: string, ttlMs: number): Promise<boolean> {
  try {
    const s = await stat(file);
    return Date.now() - s.mtime.getTime() > ttlMs;
  } catch {
    return true;
  }
}
