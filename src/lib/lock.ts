// @allow-long 668: one local lease protocol must keep claim, heartbeat, recovery, and fencing rules together
/**
 * Renewable project lease with ownership-safe stale takeover.
 *
 * Every lock transition first owns an exclusive, renewable claim. The owner
 * file is immutable except for its mtime heartbeat, and a random token—not a
 * reusable PID—is the ownership identity. Stale owners are moved to a private
 * transition directory and revalidated there before replacement.
 *
 * This is a local-filesystem lease, not a native OS mutex. A process suspended
 * beyond the TTL can lose ownership, and safe no-replace publication requires
 * hard-link support (NTFS/ext4/APFS; some FAT/SMB mounts do not provide it).
 * Unsupported hard links reject claim publication before takeover mutates the
 * canonical lock. If support disappears mid-transition, acquisition fails and
 * reports the private recovery path instead of deleting captured owner bytes.
 */

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { hostname } from "node:os";
import { link, lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { LockError } from "./errors.js";
import type { Logger } from "./logger.js";
import { assertProjectMutationAdmitted } from "./lock-admission.js";

export interface LockOwner {
  pid: number;
  startTime: string;
  host?: string;
  /** Unique lease identity. Older GhostInit lock files do not have this field. */
  token?: string;
}

export interface LockOptions {
  ttlMs?: number;
  force?: boolean;
  /** Primarily useful for short-TTL tests. Must be shorter than `ttlMs`. */
  heartbeatMs?: number;
  /** Maximum age of an abandoned transition claim before recovery. */
  claimTtlMs?: number;
}

interface LockClaim {
  token: string;
  pid: number;
  host: string;
  startedAt: string;
}

interface LeaseSnapshot<T> {
  value?: T;
  raw: string;
  mtimeMs: number;
}

interface LeaseHeartbeat {
  stopAndDrain: () => Promise<void>;
}

interface ClaimGuard {
  claim: LockClaim;
  quarantinePath: string;
  assertOwned: () => Promise<void>;
  release: () => Promise<void>;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CLAIM_TTL_MS = 30 * 1000;
const LOCK_FILE_NAME = ".ghostinit.lock";
const CLAIM_FILE_NAME = ".ghostinit.lock.takeover";
const TRANSITION_PREFIX = ".ghostinit-lock-transition-";
const CLAIM_RETRY_MS = 10;

export function lockPath(root: string): string {
  return join(root, LOCK_FILE_NAME);
}

function claimPath(root: string): string {
  return join(root, CLAIM_FILE_NAME);
}

function transitionDirectory(root: string, token: string): string {
  return join(root, `${TRANSITION_PREFIX}${token}`);
}

function transitionQuarantine(root: string, token: string): string {
  return join(transitionDirectory(root, token), "owner");
}

function isUuid(value: string | undefined): value is string {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isOwnedTransitionPath(root: string, token: string, candidate: string): boolean {
  if (!isUuid(token)) return false;
  const expected = resolve(transitionQuarantine(root, token));
  return (
    resolve(candidate) === expected &&
    dirname(expected) === resolve(transitionDirectory(root, token))
  );
}

function resolveHost(): string {
  try {
    return process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? hostname();
  } catch {
    return process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown";
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseOwner(raw: string): LockOwner | undefined {
  try {
    const value = JSON.parse(raw) as Partial<LockOwner>;
    if (!Number.isSafeInteger(value.pid) || typeof value.startTime !== "string") return undefined;
    if (value.host !== undefined && typeof value.host !== "string") return undefined;
    if (value.token !== undefined && !isUuid(value.token)) return undefined;
    return value as LockOwner;
  } catch {
    return undefined;
  }
}

function parseClaim(raw: string): LockClaim | undefined {
  try {
    const value = JSON.parse(raw) as Partial<LockClaim>;
    if (
      !isUuid(value.token) ||
      !Number.isSafeInteger(value.pid) ||
      typeof value.host !== "string" ||
      typeof value.startedAt !== "string"
    ) {
      return undefined;
    }
    return value as LockClaim;
  } catch {
    return undefined;
  }
}

async function snapshot<T>(
  file: string,
  parse: (raw: string) => T | undefined,
): Promise<LeaseSnapshot<T> | undefined> {
  try {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const handle = await open(file, constants.O_RDONLY | noFollow);
    try {
      const [raw, info] = await Promise.all([handle.readFile("utf8"), handle.stat()]);
      if (!info.isFile()) return undefined;
      return { value: parse(raw), raw, mtimeMs: info.mtimeMs };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

function sameOwner(left: LockOwner | undefined, right: LockOwner): boolean {
  if (left?.token !== undefined && right.token !== undefined) return left.token === right.token;
  return (
    left?.pid === right.pid &&
    left.startTime === right.startTime &&
    (left.host ?? "") === (right.host ?? "")
  );
}

function validateDurations(options: LockOptions): {
  ttlMs: number;
  heartbeatMs: number;
  claimTtlMs: number;
} {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const heartbeatMs = options.heartbeatMs ?? Math.max(10, Math.min(30_000, Math.floor(ttlMs / 3)));
  const claimTtlMs = options.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new LockError("Lock TTL must be positive");
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0 || heartbeatMs > ttlMs / 3) {
    throw new LockError("Lock heartbeat must be positive and no longer than one third of the TTL");
  }
  if (!Number.isFinite(claimTtlMs) || claimTtlMs < 30) {
    throw new LockError("Lock claim TTL must be at least 30 milliseconds");
  }
  return { ttlMs, heartbeatMs, claimTtlMs };
}

async function publishExclusive(file: string, value: object): Promise<void> {
  const candidate = `${file}.candidate-${randomUUID()}`;
  const handle = await open(candidate, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2), "utf8");
    await handle.close();
    // Publish a completely-written inode without replacing an existing lease.
    await link(candidate, file);
  } finally {
    await handle.close().catch(() => undefined);
    // Once the hard link succeeds this name is only an artifact. A cleanup
    // failure must not turn a valid published owner into an orphaned error.
    await unlink(candidate).catch(() => undefined);
  }
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function restoreNoReplace(source: string, destination: string): Promise<boolean> {
  try {
    await link(source, destination);
    await unlink(source);
    return true;
  } catch (error) {
    if (errorCode(error) === "EEXIST") return false;
    throw error;
  }
}

async function cleanupEmptyDirectory(path: string): Promise<void> {
  await rmdir(path).catch(() => undefined);
}

function startHeartbeat(
  file: string,
  matches: (raw: string) => boolean,
  intervalMs: number,
  logger: Logger,
  label: string,
): LeaseHeartbeat {
  let stopped = false;
  let running: Promise<void> | undefined;

  const beat = async (): Promise<void> => {
    if (stopped) return;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const noFollow = constants.O_NOFOLLOW ?? 0;
      handle = await open(file, constants.O_RDWR | noFollow);
      const raw = await handle.readFile("utf8");
      if (!matches(raw)) {
        stopped = true;
        clearInterval(timer);
        return;
      }
      const now = new Date();
      await handle.utimes(now, now);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        logger.warn(`${label} heartbeat failed`, { file, cause: errorMessage(error) });
      }
    } finally {
      await handle?.close().catch(() => undefined);
    }
  };

  const timer = setInterval(() => {
    if (stopped || running !== undefined) return;
    running = beat().finally(() => {
      running = undefined;
    });
  }, intervalMs);
  timer.unref();

  return {
    async stopAndDrain() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}

async function removeOwnedClaim(
  root: string,
  claim: LockClaim,
  transitionDir: string,
): Promise<void> {
  const fixed = claimPath(root);
  const movedPath = join(transitionDir, "claim");
  try {
    await rename(fixed, movedPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }

  const moved = await snapshot(movedPath, parseClaim);
  if (moved?.value?.token === claim.token) {
    await unlink(movedPath);
    return;
  }
  if (!(await restoreNoReplace(movedPath, fixed))) {
    throw new LockError("Lock transition ownership changed during release", {
      claimFile: fixed,
      recoveryPath: movedPath,
    });
  }
}

async function recoverAbandonedClaim(
  root: string,
  claimTtlMs: number,
  logger: Logger,
): Promise<boolean> {
  const fixed = claimPath(root);
  const observed = await snapshot(fixed, parseClaim);
  if (observed === undefined) return true;
  if (Date.now() - observed.mtimeMs <= claimTtlMs) return false;

  const recoveryDir = transitionDirectory(root, randomUUID());
  await mkdir(recoveryDir, { mode: 0o700 });
  const recoveryClaim = join(recoveryDir, "claim");
  try {
    await rename(fixed, recoveryClaim);
  } catch (error) {
    await cleanupEmptyDirectory(recoveryDir);
    if (errorCode(error) === "ENOENT") return true;
    return false;
  }

  const moved = await snapshot(recoveryClaim, parseClaim);
  if (
    moved?.value?.token !== observed.value?.token ||
    moved?.raw !== observed.raw ||
    Date.now() - moved.mtimeMs <= claimTtlMs
  ) {
    const restored = await restoreNoReplace(recoveryClaim, fixed).catch(() => false);
    if (!restored) {
      logger.warn("A lock claim changed during abandoned-claim recovery", {
        claimFile: fixed,
        recoveryPath: recoveryClaim,
      });
    }
    await cleanupEmptyDirectory(recoveryDir);
    return false;
  }

  const token = moved.value?.token;
  if (isUuid(token)) {
    const quarantine = transitionQuarantine(root, token);
    if (isOwnedTransitionPath(root, token, quarantine) && (await pathExists(quarantine))) {
      const file = lockPath(root);
      if (!(await pathExists(file))) {
        if (!(await restoreNoReplace(quarantine, file))) return false;
      } else {
        await unlink(quarantine).catch(() => undefined);
      }
    }
    await cleanupEmptyDirectory(transitionDirectory(root, token));
  }

  await unlink(recoveryClaim);
  await cleanupEmptyDirectory(recoveryDir);
  logger.warn("Recovered an abandoned project-lock transition", { claimFile: fixed });
  return true;
}

async function acquireClaim(root: string, claimTtlMs: number, logger: Logger): Promise<ClaimGuard> {
  const deadline = Date.now() + Math.max(1_000, claimTtlMs * 2);
  while (true) {
    if (Date.now() >= deadline) {
      throw new LockError("Timed out waiting for another project-lock transition", {
        claimFile: claimPath(root),
      });
    }
    if (!(await recoverAbandonedClaim(root, claimTtlMs, logger))) {
      await Bun.sleep(CLAIM_RETRY_MS);
      continue;
    }

    const claim: LockClaim = {
      token: randomUUID(),
      pid: process.pid,
      host: resolveHost(),
      startedAt: new Date().toISOString(),
    };
    const transitionDir = transitionDirectory(root, claim.token);
    await mkdir(transitionDir, { mode: 0o700 });
    try {
      await publishExclusive(claimPath(root), claim);
    } catch (error) {
      await cleanupEmptyDirectory(transitionDir);
      if (errorCode(error) === "EEXIST") {
        await Bun.sleep(CLAIM_RETRY_MS);
        continue;
      }
      throw error;
    }

    const intervalMs = Math.max(5, Math.min(1_000, Math.floor(claimTtlMs / 3)));
    const heartbeat = startHeartbeat(
      claimPath(root),
      (raw) => parseClaim(raw)?.token === claim.token,
      intervalMs,
      logger,
      "Project lock transition",
    );
    let released = false;
    return {
      claim,
      quarantinePath: transitionQuarantine(root, claim.token),
      async assertOwned() {
        const current = await snapshot(claimPath(root), parseClaim);
        if (current?.value?.token !== claim.token) {
          throw new LockError("Project lock transition ownership was lost", {
            claimFile: claimPath(root),
          });
        }
      },
      async release() {
        if (released) return;
        released = true;
        await heartbeat.stopAndDrain();
        try {
          await removeOwnedClaim(root, claim, transitionDir);
        } finally {
          await cleanupEmptyDirectory(transitionDir);
        }
      },
    };
  }
}

async function restoreCapturedLock(
  quarantine: string,
  file: string,
  owner: LockOwner | undefined,
): Promise<never> {
  if (!(await restoreNoReplace(quarantine, file))) {
    throw new LockError("Unable to restore a captured project lock safely", {
      lockFile: file,
      owner,
      recoveryPath: quarantine,
    });
  }
  throw new LockError("Project lock is held by another GhostInit process", {
    lockFile: file,
    owner,
  });
}

export async function acquireLock(
  root: string,
  logger: Logger,
  options: LockOptions = {},
): Promise<{ release: () => Promise<void>; owner: LockOwner }> {
  const { ttlMs, heartbeatMs, claimTtlMs } = validateDurations(options);
  await assertProjectMutationAdmitted(root);
  await mkdir(root, { recursive: true });
  const owner: LockOwner = {
    pid: process.pid,
    startTime: new Date().toISOString(),
    host: resolveHost(),
    token: randomUUID(),
  };
  const file = lockPath(root);
  const guard = await acquireClaim(root, claimTtlMs, logger);
  let published = false;
  let ownerHeartbeat: LeaseHeartbeat | undefined;
  let acquisitionError: unknown;

  try {
    await assertProjectMutationAdmitted(root);
    const existing = await snapshot(file, parseOwner);
    if (existing !== undefined && Date.now() - existing.mtimeMs <= ttlMs && !options.force) {
      throw new LockError("Project lock is held by another GhostInit process", {
        lockFile: file,
        owner: existing.value,
      });
    }

    let captured: LeaseSnapshot<LockOwner> | undefined;
    if (existing !== undefined) {
      await guard.assertOwned();
      await rename(file, guard.quarantinePath);
      captured = await snapshot(guard.quarantinePath, parseOwner);
      if (captured === undefined) {
        throw new LockError("Captured project lock is not a regular file", {
          recoveryPath: guard.quarantinePath,
        });
      }
      if (Date.now() - captured.mtimeMs <= ttlMs && !options.force) {
        await restoreCapturedLock(guard.quarantinePath, file, captured.value);
      }
      logger.warn(
        options.force ? "Forcing project-lock takeover" : "Taking over stale project lock",
        {
          file,
          existing: captured.value,
        },
      );
    }

    try {
      await guard.assertOwned();
      await assertProjectMutationAdmitted(root);
      await publishExclusive(file, owner);
      published = true;
    } catch (error) {
      if (captured !== undefined && !(await pathExists(file))) {
        const restored = await restoreNoReplace(guard.quarantinePath, file).catch(() => false);
        if (!restored) {
          throw new LockError("Lock publication failed and the previous owner needs recovery", {
            lockFile: file,
            recoveryPath: guard.quarantinePath,
            cause: errorMessage(error),
          });
        }
      }
      throw error;
    }

    ownerHeartbeat = startHeartbeat(
      file,
      (raw) => sameOwner(parseOwner(raw), owner),
      heartbeatMs,
      logger,
      "Project lock",
    );
    if (captured !== undefined) {
      await unlink(guard.quarantinePath).catch((error) => {
        logger.warn("Could not clean a stale project-lock quarantine", {
          recoveryPath: guard.quarantinePath,
          cause: errorMessage(error),
        });
      });
    }
  } catch (error) {
    if (!published) {
      acquisitionError = error;
    } else {
      logger.warn("Project lock was published but transition cleanup failed", {
        lockFile: file,
        cause: errorMessage(error),
      });
    }
  }
  try {
    await guard.release();
  } catch (error) {
    if (!published && acquisitionError === undefined) {
      acquisitionError = error;
    } else {
      logger.warn("Project lock was acquired but its transition claim needs stale recovery", {
        lockFile: file,
        cause: errorMessage(error),
      });
    }
  }

  if (acquisitionError !== undefined) throw acquisitionError;

  if (published && ownerHeartbeat === undefined) {
    ownerHeartbeat = startHeartbeat(
      file,
      (raw) => sameOwner(parseOwner(raw), owner),
      heartbeatMs,
      logger,
      "Project lock",
    );
  }
  if (!published || ownerHeartbeat === undefined) {
    throw new LockError("Unable to acquire project lock", { lockFile: file });
  }

  const createOwnerHeartbeat = () =>
    startHeartbeat(
      file,
      (raw) => sameOwner(parseOwner(raw), owner),
      heartbeatMs,
      logger,
      "Project lock",
    );
  let liveHeartbeat: LeaseHeartbeat = ownerHeartbeat;
  let releasePromise: Promise<void> | undefined;
  async function releaseOwned(): Promise<void> {
    const releaseGuard = await acquireClaim(root, claimTtlMs, logger);
    let heartbeatStopped = false;
    let removedOrSuperseded = false;
    let releaseError: unknown;
    try {
      const current = await snapshot(file, parseOwner);
      if (!sameOwner(current?.value, owner)) {
        await liveHeartbeat.stopAndDrain();
        heartbeatStopped = true;
        removedOrSuperseded = true;
      } else {
        await releaseGuard.assertOwned();
        await liveHeartbeat.stopAndDrain();
        heartbeatStopped = true;

        // A heartbeat that was already in flight is now drained. Revalidate the
        // token under the transition claim before moving the canonical entry.
        const afterDrain = await snapshot(file, parseOwner);
        if (!sameOwner(afterDrain?.value, owner)) {
          removedOrSuperseded = true;
        } else {
          await rename(file, releaseGuard.quarantinePath);
          const moved = await snapshot(releaseGuard.quarantinePath, parseOwner);
          if (sameOwner(moved?.value, owner)) {
            removedOrSuperseded = true;
            await unlink(releaseGuard.quarantinePath).catch((error) => {
              logger.warn("Project lock was released but its quarantine could not be cleaned", {
                recoveryPath: releaseGuard.quarantinePath,
                cause: errorMessage(error),
              });
            });
          } else {
            if (!(await restoreNoReplace(releaseGuard.quarantinePath, file))) {
              throw new LockError("A different lock owner could not be restored during release", {
                lockFile: file,
                recoveryPath: releaseGuard.quarantinePath,
              });
            }
            removedOrSuperseded = true;
          }
        }
      }
    } catch (error) {
      releaseError = error;
    }
    try {
      await releaseGuard.release();
    } catch (error) {
      if (removedOrSuperseded) {
        logger.warn("Project lock was released but its transition claim needs stale recovery", {
          lockFile: file,
          cause: errorMessage(error),
        });
      } else if (releaseError === undefined) {
        releaseError = error;
      }
    }

    if (releaseError !== undefined) {
      if (heartbeatStopped && !removedOrSuperseded) {
        const current = await snapshot(file, parseOwner).catch(() => undefined);
        if (sameOwner(current?.value, owner)) liveHeartbeat = createOwnerHeartbeat();
      }
      throw releaseError;
    }
  }

  function release(): Promise<void> {
    releasePromise ??= releaseOwned().catch((error) => {
      releasePromise = undefined;
      throw error;
    });
    return releasePromise;
  }

  return { release, owner };
}
