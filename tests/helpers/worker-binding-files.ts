// @allow-long 404: staging, private recovery, and identity-checked restoration share one fixture lifecycle
import { randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CLOUDFLARE_ENVIRONMENT_LOCK_FILE } from "../../src/lib/dotenv.js";
import { acquireEnvironmentLifecycleLease } from "../../src/lib/environment-lifecycle.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { createTemporaryWorkspace } from "./temporary-workspace.js";

interface BindingReplacement {
  path: string;
  original: string;
  content: string;
}

interface Snapshot {
  identity: Stats;
  content: string;
}

type Lease = ReturnType<typeof acquireEnvironmentLifecycleLease>;
type DirectoryIdentities = Map<string, Stats>;

interface OriginalRecovery {
  path: string;
  directories: DirectoryIdentities;
  files: Array<{ path: string; snapshot: Snapshot }>;
}

function failure(message: string, cleanupVerified: boolean, cause?: unknown): Error {
  return Object.assign(new Error(message, { cause }), { cleanupVerified });
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
}

function normalized(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

async function directoryIdentity(path: string): Promise<Stats> {
  const before = await lstat(path);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error("Worker fixture directory is linked or is not a directory");
  }
  const resolved = await realpath(path);
  // Bun can report a Windows volume root as "D:". Only a realpath result
  // receives this correction; caller paths such as "D:relative" stay invalid.
  const canonical =
    process.platform === "win32" && /^[A-Za-z]:$/.test(resolved) ? `${resolved}\\` : resolved;
  if (normalized(canonical) !== normalized(path)) {
    throw new Error("Worker fixture directory resolves through a linked parent");
  }
  if (!sameIdentity(before, await lstat(path))) {
    throw new Error("Worker fixture directory changed during inspection");
  }
  return before;
}

async function captureDirectories(root: string, entries: readonly { path: string }[]) {
  const paths = new Set<string>();
  for (const entry of entries) {
    let path = dirname(resolve(root, entry.path));
    while (true) {
      paths.add(path);
      const parent = dirname(path);
      if (parent === path) break;
      path = parent;
    }
  }
  const identities: DirectoryIdentities = new Map();
  for (const path of [...paths].sort((left, right) => left.length - right.length)) {
    identities.set(path, await directoryIdentity(path));
  }
  return identities;
}

async function verifyDirectories(identities: DirectoryIdentities): Promise<void> {
  for (const [path, identity] of identities) {
    if (!sameIdentity(identity, await directoryIdentity(path))) {
      throw new Error("Worker fixture directory identity changed");
    }
  }
}

async function snapshot(path: string, expected?: string): Promise<Snapshot> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 1024 * 1024) {
    throw new Error("Worker binding file is linked, oversized, or not a regular file");
  }
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!sameIdentity(before, await handle.stat())) {
      throw new Error("Worker binding file changed while opening it");
    }
    const content = await handle.readFile("utf8");
    if (
      (expected !== undefined && content !== expected) ||
      !sameIdentity(before, await lstat(path))
    ) {
      throw new Error("Worker binding file bytes or identity changed");
    }
    return { identity: before, content };
  } finally {
    await handle.close();
  }
}

async function verifySnapshot(path: string, expected: Snapshot): Promise<void> {
  const observed = await snapshot(path, expected.content);
  if (!sameIdentity(expected.identity, observed.identity)) {
    throw new Error("Worker binding file ownership changed");
  }
}

async function retainOriginals(
  recovery: OriginalRecovery,
  root: string,
  entries: readonly BindingReplacement[],
): Promise<void> {
  const files = entries.map((entry, index) => ({
    path: `${index}.original`,
    content: entry.original,
  }));
  files.push({
    path: "bindings.json",
    content: JSON.stringify({ version: 1, root, paths: entries.map((entry) => entry.path) }) + "\n",
  });
  recovery.directories = await captureDirectories(recovery.path, files);
  const backups = new FsTransaction(recovery.path);
  for (const file of files) await backups.writeIfUnchanged(file.path, file.content, null);
  await backups.commit();
  for (const file of files) {
    const path = join(recovery.path, file.path);
    recovery.files.push({ path, snapshot: await snapshot(path, file.content) });
  }
  await verifyDirectories(recovery.directories);
}

async function removeOriginals(recovery: OriginalRecovery): Promise<void> {
  for (const file of recovery.files) {
    await verifyDirectories(recovery.directories);
    await verifySnapshot(file.path, file.snapshot);
    await unlink(file.path);
  }
  await verifyDirectories(recovery.directories);
  await rmdir(recovery.path);
}

async function markRecovery(
  root: string,
  directories: DirectoryIdentities,
  lease: Lease,
  recovery: OriginalRecovery,
): Promise<void> {
  await verifyDirectories(directories);
  lease.assertIdle();
  const lockPath = join(root, CLOUDFLARE_ENVIRONMENT_LOCK_FILE);
  const lock = await snapshot(lockPath);
  lease.assertIdle();
  const marker = join(root, `.dev.vars.ghostinit-process-recovery-fixture-${randomUUID()}`);
  await mkdir(marker, { mode: 0o700 });
  const markerDirectories = new Map(directories);
  markerDirectories.set(marker, await directoryIdentity(marker));
  const verifyOwnership = async () => {
    await verifyDirectories(markerDirectories);
    await verifySnapshot(lockPath, lock);
  };
  await verifyOwnership();
  const transaction = new FsTransaction(marker);
  await transaction.writeIfUnchanged(
    "recovery.json",
    JSON.stringify({ version: 1, originals: recovery.path }) + "\n",
    null,
  );
  await verifyOwnership();
  await transaction.commit();
  await verifyOwnership();
}

function recoveryFailure(message: string, recovery: OriginalRecovery, cause: unknown): Error {
  return Object.assign(
    failure(`${message} Recovery evidence was retained at ${recovery.path}.`, false, cause),
    { recoveryDirectory: recovery.path },
  );
}

async function restoreBindings(
  root: string,
  entries: readonly BindingReplacement[],
  installed: readonly Snapshot[],
  directories: DirectoryIdentities,
): Promise<void> {
  let lease: Lease | undefined;
  let recovery: string | undefined;
  let problem: unknown;
  try {
    await verifyDirectories(directories);
    lease = acquireEnvironmentLifecycleLease(root);
    lease.assertIdle();
    const lockPath = join(root, CLOUDFLARE_ENVIRONMENT_LOCK_FILE);
    const lock = await snapshot(lockPath);
    lease.assertIdle();
    const verifyOwnership = async () => {
      await verifyDirectories(directories);
      await verifySnapshot(lockPath, lock);
    };
    for (const [index, entry] of entries.entries()) {
      await verifySnapshot(resolve(root, entry.path), installed[index]!);
    }
    await verifyOwnership();
    recovery = join(root, `.dev.vars.ghostinit-process-recovery-fixture-${randomUUID()}`);
    await mkdir(recovery, { mode: 0o700 });
    directories.set(recovery, await directoryIdentity(recovery));

    // Originals become durable before any canonical fixture is moved. This
    // recovery marker is created only after all owned processes have stopped.
    const backups = new FsTransaction(recovery);
    for (const [index, entry] of entries.entries()) {
      await backups.writeIfUnchanged(`${index}.original`, entry.original, null);
    }
    await backups.commit();
    const retained: Array<{ path: string; snapshot: Snapshot }> = [];
    for (const [index, entry] of entries.entries()) {
      const path = join(recovery, `${index}.original`);
      retained.push({ path, snapshot: await snapshot(path, entry.original) });
    }

    for (const [index, entry] of entries.entries()) {
      await verifyOwnership();
      const source = resolve(root, entry.path);
      const captured = join(recovery, `${index}.fixture`);
      await verifySnapshot(source, installed[index]!);
      // The exclusive, private recovery directory gives each capture a fresh
      // destination. Verify after the move so a racing replacement is retained.
      await rename(source, captured);
      await verifySnapshot(captured, installed[index]!);
      retained.push({ path: captured, snapshot: installed[index]! });
    }

    await verifyOwnership();
    const originals = new FsTransaction(root);
    for (const entry of entries) {
      await originals.writeIfUnchanged(entry.path, entry.original, null);
    }
    await originals.commit();
    for (const entry of entries) await snapshot(resolve(root, entry.path), entry.original);

    for (const retainedFile of retained) {
      await verifyOwnership();
      await verifySnapshot(retainedFile.path, retainedFile.snapshot);
      await unlink(retainedFile.path);
    }
    await verifyOwnership();
    await rmdir(recovery);
    directories.delete(recovery);
    recovery = undefined;
  } catch (error) {
    problem = error;
  }
  try {
    lease?.release();
  } catch (error) {
    problem = problem ? new AggregateError([problem, error]) : error;
  }
  if (problem) {
    throw failure(
      recovery
        ? `Worker binding restoration failed; recovery evidence was retained at ${recovery}.`
        : "Worker binding restoration was refused or could not be verified.",
      false,
      problem,
    );
  }
}

/** Temporarily replace only the generated Worker mirrors, retaining their exact originals. */
export async function stageWorkerBindingFiles(
  directory: string,
  replacements: readonly BindingReplacement[],
): Promise<{ restore(cleanupVerified: boolean): Promise<void> }> {
  if (/^[A-Za-z]:(?![\\/])/.test(directory)) {
    throw failure("Worker binding staging does not accept drive-relative roots.", false);
  }
  const root = resolve(directory);
  const entries = replacements.map((entry) => ({ ...entry }));
  const allowed = new Set([".dev.vars", "apps/web/.dev.vars"]);
  if (
    entries.length === 0 ||
    entries.length > 2 ||
    new Set(entries.map((entry) => entry.path)).size !== entries.length ||
    entries.some((entry) => !allowed.has(entry.path))
  ) {
    throw failure("Worker binding staging requires distinct generated .dev.vars paths.", false);
  }

  let directories: DirectoryIdentities = new Map();
  let installed: Snapshot[] = [];
  let lease: Lease | undefined;
  let committed = false;
  let compensated = false;
  let problem: unknown;
  let recovery: OriginalRecovery | undefined;
  const transaction = new FsTransaction(root);
  try {
    directories = await captureDirectories(root, entries);
    lease = acquireEnvironmentLifecycleLease(root);
    lease.assertIdle();
    for (const entry of entries) {
      await snapshot(resolve(root, entry.path), entry.original);
      await transaction.writeIfUnchanged(entry.path, entry.content, entry.original);
    }
    // Keep originals outside the project until restoration succeeds. A failed
    // post-commit read or a replaced project parent must not strand them in the
    // rejected stage's closure. This private directory is not a project marker
    // while the fixture is active, so normal Worker lifecycle leases still work.
    recovery = {
      path: createTemporaryWorkspace("ghostinit-worker-bindings-recovery-"),
      directories: new Map(),
      files: [],
    };
    await retainOriginals(recovery, root, entries);
    await verifyDirectories(directories);
    lease.assertIdle();
    await transaction.commit();
    committed = true;
    installed = await Promise.all(
      entries.map((entry) => snapshot(resolve(root, entry.path), entry.content)),
    );
    await verifyDirectories(directories);
    lease.assertIdle();
  } catch (error) {
    problem = error;
    if (lease && !committed) {
      try {
        await verifyDirectories(directories);
        await transaction.rollback();
        for (const entry of entries) await snapshot(resolve(root, entry.path), entry.original);
        await verifyDirectories(directories);
        lease.assertIdle();
        compensated = true;
      } catch (rollbackError) {
        problem = new AggregateError([error, rollbackError]);
      }
    }
  }
  if (problem && recovery && !compensated && lease) {
    try {
      // Fence further project work when its original ownership still verifies.
      // The independent private originals survive even if publishing this
      // marker is unsafe because a parent or the lifecycle owner changed.
      await markRecovery(root, directories, lease, recovery);
    } catch (error) {
      problem = new AggregateError([problem, error]);
    }
  }
  try {
    lease?.release();
  } catch (error) {
    compensated = false;
    problem = problem ? new AggregateError([problem, error]) : error;
  }
  if (problem && recovery && compensated) {
    try {
      await removeOriginals(recovery);
      recovery = undefined;
    } catch (error) {
      compensated = false;
      problem = new AggregateError([problem, error]);
    }
  }
  if (problem) {
    if (recovery)
      throw recoveryFailure("Worker binding fixture staging failed.", recovery, problem);
    throw failure("Worker binding fixture staging failed.", compensated, problem);
  }

  let restoration: Promise<void> | undefined;
  return {
    restore(cleanupVerified) {
      if (!cleanupVerified) {
        return Promise.reject(
          recoveryFailure(
            "Worker processes must stop before restoring bindings.",
            recovery!,
            undefined,
          ),
        );
      }
      restoration ??= (async () => {
        try {
          await restoreBindings(root, entries, installed, directories);
          await removeOriginals(recovery!);
        } catch (error) {
          throw recoveryFailure("Worker binding restoration failed.", recovery!, error);
        }
      })();
      return restoration;
    },
  };
}
