// @allow-long 1307: path-safe staging, atomic rename, CAS rollback, and stale-staging GC share one transaction boundary
/**
 * Transactional filesystem helpers.
 *
 * A transaction records every write so an unexpected error or cancellation
 * can roll the project back to its previous state. Paths are stored as POSIX
 * relative paths internally, then resolved against the project root.
 */

import {
  mkdir,
  rmdir,
  readFile,
  rename,
  readdir,
  realpath,
  lstat,
  open,
  stat,
  unlink,
  link,
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { STAGING_SUFFIX, STAGING_TTL_MS } from "./constants.js";

export type FileOperation =
  | {
      path: string;
      kind: "write";
      previousContent?: Buffer;
      wasCreated: boolean;
      /** Exact bytes installed by this transaction and required for rollback CAS. */
      writtenContent: Buffer;
    }
  | {
      path: string;
      kind: "delete";
      previousContent: Buffer;
      wasCreated: false;
    };

export type RollbackFailureReason =
  | "content-changed"
  | "path-missing"
  | "path-appeared"
  | "unsafe-path"
  | "io-error";

export interface RollbackFailure {
  path: string;
  action: "restore" | "remove";
  reason: RollbackFailureReason;
  message: string;
  /**
   * A transaction-private recovery path is reported only when a racing entry
   * was moved out of place and could not safely be put back without replacing
   * another user-created entry.
   */
  recoveryPath?: string;
}

export interface RollbackResult {
  success: true;
  restored: string[];
  removed: string[];
  failures: [];
}

export interface FailedRollbackResult {
  success: false;
  restored: string[];
  removed: string[];
  failures: RollbackFailure[];
}

export interface FsSafetyDiagnostics {
  pathValidations: number;
  realpathCalls: number;
}

/**
 * Thrown when rollback could not restore every path without overwriting bytes
 * that no longer belong to this transaction.
 */
export class FsRollbackError extends Error {
  readonly result: FailedRollbackResult;

  constructor(message: string, result: FailedRollbackResult, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "FsRollbackError";
    this.result = result;
  }
}

export interface StagedFile {
  path: string;
  content: string;
}

interface PendingWrite {
  content: string;
  previousContent?: Buffer;
  wasCreated: boolean;
}

interface QuarantinedFile {
  containerPath: string;
  displacedPath: string;
}

interface OperationRollbackSuccess {
  operation: FileOperation;
  restored?: string;
  removed?: string;
}

interface RollbackAttempt {
  restored: string[];
  removed: string[];
  completed: FileOperation[];
  failures: RollbackFailure[];
}

interface FsEntryIdentity {
  dev: number;
  ino: number;
}

export class FsTransaction {
  private readonly root: string;
  private canonicalRoot?: string;
  private readonly operations: FileOperation[] = [];
  private readonly createdDirs: string[] = [];
  private readonly pendingWrites: Map<string, PendingWrite> = new Map();
  private readonly pendingDeletes: Map<string, Buffer> = new Map();
  private committed = false;
  private rolledBack = false;
  private rollbackResult?: RollbackResult;
  private rollbackFailure?: FsRollbackError;
  private readonly safetyDiagnostics: FsSafetyDiagnostics = {
    pathValidations: 0,
    realpathCalls: 0,
  };
  private readonly verifiedDirectories = new Map<string, FsEntryIdentity>();

  constructor(root: string) {
    this.root = resolve(root);
    // Construction is side-effect free so planners can use a transaction as an
    // in-memory overlay. Stale staging cleanup runs only immediately before an
    // actual commit (and during rollback of an attempted commit).
  }

  /** Operation counts make path-safety performance regressions testable without wall-clock flakes. */
  getSafetyDiagnostics(): Readonly<FsSafetyDiagnostics> {
    return { ...this.safetyDiagnostics };
  }

  /**
   * Remove regular files whose basename exactly matches the staging filename
   * produced by commit (`<target-name>.ghostinit-staging`) and whose mtime is
   * older than the TTL. Directories are never transaction staging entries and
   * are deliberately not removed, even when they use a similar name.
   */
  async cleanupStaleStaging(): Promise<{ removed: string[] }> {
    const removed: string[] = [];
    const now = Date.now();
    try {
      const entries = await this.recursiveFindStaging(this.root);
      for (const relPath of entries) {
        try {
          const absPath = await this.assertSafePath(relPath);
          const s = await lstat(absPath);
          // A staging-looking link is never followed or removed. Leaving an
          // untrusted entry behind is safer than touching its target.
          if (s.isSymbolicLink()) continue;
          const age = now - s.mtimeMs;
          if (age > STAGING_TTL_MS) {
            // Re-check immediately before the destructive operation. This also
            // catches a directory replaced with a junction after discovery.
            await this.assertSafePath(relPath);
            await this.removeStagingEntry(relPath);
            removed.push(relPath);
          }
        } catch {
          // ignore individual failures
        }
      }
    } catch {
      // root may not exist yet, ignore
    }
    return { removed };
  }

  private async recursiveFindStaging(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: Dirent<string>[];
    try {
      await this.assertSafeDirectory(dir);
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        // lstat/Dirent checks are intentionally performed before realpath so a
        // symlink or Windows junction is skipped rather than followed.
        info = await lstat(abs);
      } catch {
        continue;
      }
      if (entry.isSymbolicLink() || info.isSymbolicLink()) continue;

      const relPath = relative(this.root, abs).split(sep).join("/");
      if (
        info.isFile() &&
        entry.name.length > STAGING_SUFFIX.length &&
        entry.name.endsWith(STAGING_SUFFIX)
      ) {
        try {
          await this.assertSafePath(relPath);
          results.push(relPath);
        } catch {
          // A candidate behind a swapped link is not GhostInit-owned cleanup.
        }
        continue;
      }
      // Current transactions never create staging directories. Treat every
      // staging-looking directory as user-owned and do not inspect its content.
      if (info.isDirectory() && entry.name.includes(STAGING_SUFFIX)) {
        continue;
      }
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".next" ||
        entry.name === "dist" ||
        entry.name === ".output" ||
        entry.name === ".vercel" ||
        entry.name === ".turbo"
      ) {
        continue;
      }
      if (info.isDirectory()) {
        const nested = await this.recursiveFindStaging(abs);
        results.push(...nested);
      }
    }
    return results;
  }

  private async removeStagingEntry(relPath: string): Promise<void> {
    const absPath = await this.assertSafePath(relPath);
    const info = await lstat(absPath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Refusing to remove a non-file staging entry: ${relPath}`);
    }
    await this.assertSafePath(relPath);
    await unlink(absPath);
  }

  private isContained(root: string, candidate: string): boolean {
    const rel = relative(root, candidate);
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  }

  private async resolveRealPath(path: string): Promise<string> {
    this.safetyDiagnostics.realpathCalls += 1;
    return resolve(await realpath(path));
  }

  private entryIdentity(info: { dev: number; ino: number }): FsEntryIdentity {
    return { dev: info.dev, ino: info.ino };
  }

  private sameIdentity(left: FsEntryIdentity | undefined, right: FsEntryIdentity): boolean {
    return left?.dev === right.dev && left.ino === right.ino;
  }

  private async getCanonicalRoot(): Promise<string> {
    if (this.canonicalRoot !== undefined) return this.canonicalRoot;
    const current = await this.resolveRealPath(this.root);
    const info = await stat(current);
    if (!info.isDirectory()) throw new Error(`Project root is not a directory: ${this.root}`);
    this.canonicalRoot = current;
    this.verifiedDirectories.set(this.root, this.entryIdentity(info));
    return this.canonicalRoot;
  }

  private async assertVerifiedDirectory(absDir: string, relPath: string): Promise<void> {
    const canonicalRoot = await this.getCanonicalRoot();
    const absolute = resolve(absDir);
    if (!this.isContained(this.root, absolute)) {
      throw new Error(`Directory escapes project root: ${relPath}`);
    }

    const observed: Array<{ path: string; identity: FsEntryIdentity }> = [];
    const rootInfo = await stat(this.root);
    if (!rootInfo.isDirectory()) throw new Error(`Project root is not a directory: ${this.root}`);
    observed.push({ path: this.root, identity: this.entryIdentity(rootInfo) });

    const rel = relative(this.root, absolute);
    let current = this.root;
    for (const segment of rel.split(sep).filter(Boolean)) {
      current = join(current, segment);
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Refusing to follow a symbolic link or junction: ${relPath}`);
      }
      observed.push({ path: current, identity: this.entryIdentity(info) });
    }

    let allCached = true;
    for (const { path, identity } of observed) {
      const cached = this.verifiedDirectories.get(path);
      if (cached === undefined) {
        allCached = false;
      } else if (!this.sameIdentity(cached, identity)) {
        throw new Error(`Directory changed while the transaction was active: ${relPath}`);
      }
    }
    if (allCached) return;

    const canonical = await this.resolveRealPath(absolute);
    const expectedCanonical = resolve(canonicalRoot, rel);
    if (
      !this.isContained(canonicalRoot, canonical) ||
      relative(expectedCanonical, canonical) !== ""
    ) {
      throw new Error(`Refusing to follow a symbolic link or junction: ${relPath}`);
    }
    for (const { path, identity } of observed) {
      this.verifiedDirectories.set(path, identity);
    }
  }

  private async assertCurrentRoot(): Promise<void> {
    await this.assertVerifiedDirectory(this.root, ".");
  }

  private async rememberCreatedDirectory(absDir: string): Promise<void> {
    const info = await lstat(absDir);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Refusing to trust a linked or non-directory path: ${absDir}`);
    }
    this.verifiedDirectories.set(resolve(absDir), this.entryIdentity(info));
  }

  /**
   * Resolve a project-relative path without following a symlink/junction parent.
   * Existing components are checked both with lstat and realpath so Windows
   * reparse points that are not reported as ordinary symlinks still cannot
   * escape the canonical project root.
   */
  private async assertSafePath(relPath: string): Promise<string> {
    this.safetyDiagnostics.pathValidations += 1;
    const absPath = this.toAbsolute(relPath);
    let deepestExisting = absPath;
    let info: Awaited<ReturnType<typeof lstat>>;
    while (true) {
      try {
        info = await lstat(deepestExisting);
        break;
      } catch (error) {
        if ((error as { code?: string })?.code !== "ENOENT") throw error;
        const parent = dirname(deepestExisting);
        if (parent === deepestExisting || !this.isContained(this.root, parent)) {
          throw new Error(`Path escapes the canonical project root: ${relPath}`);
        }
        deepestExisting = parent;
      }
    }
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing to follow a symbolic link or junction: ${relPath}`);
    }
    if (deepestExisting !== absPath && !info.isDirectory()) {
      throw new Error(`Path parent is not a directory: ${relPath}`);
    }

    const directoryToVerify = info.isDirectory() ? deepestExisting : dirname(deepestExisting);
    await this.assertVerifiedDirectory(directoryToVerify, relPath);
    return absPath;
  }

  private async assertSafeDirectory(absDir: string): Promise<void> {
    const absolute = resolve(absDir);
    const rel = relative(this.root, absolute);
    if (rel === "") {
      await this.getCanonicalRoot();
      return;
    }
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Directory escapes project root: ${absDir}`);
    }
    const safe = await this.assertSafePath(rel.split(sep).join("/"));
    const info = await lstat(safe);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Refusing to traverse a linked or non-directory path: ${absDir}`);
    }
  }

  private async readDiskFile(relPath: string): Promise<Buffer | undefined> {
    try {
      const absPath = await this.assertSafePath(relPath);
      return await readFile(absPath);
    } catch (error) {
      if ((error as { code?: string })?.code === "ENOENT") return undefined;
      throw error;
    }
  }

  toAbsolute(relPath: string): string {
    // Reject path traversal and absolute paths before resolving against root.
    if (
      relPath.length === 0 ||
      relPath.startsWith("/") ||
      relPath.startsWith("\\\\") ||
      /^[a-zA-Z]:/.test(relPath) ||
      relPath.includes("\\")
    ) {
      throw new Error(`Unsafe absolute path: ${relPath}`);
    }
    const segments = relPath.split("/");
    if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    const resolvedPath = resolve(this.root, ...segments);
    if (!this.isContained(this.root, resolvedPath) || resolvedPath === this.root) {
      throw new Error(`Path escapes project root: ${relPath}`);
    }
    return resolvedPath;
  }

  toRelative(absPath: string): string {
    return relative(this.root, absPath).split(sep).join("/");
  }

  async exists(relPath: string): Promise<boolean> {
    if (this.pendingWrites.has(relPath)) {
      return true;
    }
    return (await this.readDiskFile(relPath)) !== undefined;
  }

  async readText(relPath: string): Promise<string | undefined> {
    const pending = this.pendingWrites.get(relPath);
    if (pending) {
      return pending.content;
    }
    const content = await this.readDiskFile(relPath);
    return content?.toString("utf8");
  }

  private async stageWrite(
    relPath: string,
    content: string,
    expectedPreviousContent: string | null | undefined,
    enforceExpected: boolean,
  ): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error("Transaction is no longer active");
    }
    if (this.pendingDeletes.has(relPath)) {
      throw new Error(`Path is already staged for deletion: ${relPath}`);
    }

    const existingPending = this.pendingWrites.get(relPath);
    if (existingPending) {
      if (existingPending.content === content) {
        return;
      }
      // Keep original previousContent/wasCreated, only update content
      this.pendingWrites.set(relPath, {
        ...existingPending,
        content,
      });
      return;
    }

    const previousContent = await this.readDiskFile(relPath);
    const wasCreated = previousContent === undefined;
    if (enforceExpected) {
      if (expectedPreviousContent === null && previousContent !== undefined) {
        throw new Error(`File appeared before it could be staged: ${relPath}`);
      }
      if (
        expectedPreviousContent !== null &&
        (previousContent === undefined ||
          previousContent.toString("utf8") !== expectedPreviousContent)
      ) {
        throw new Error(`File changed before it could be staged: ${relPath}`);
      }
    }
    if (previousContent?.toString("utf-8") === content) return;

    this.pendingWrites.set(relPath, { content, previousContent, wasCreated });
  }

  async write(relPath: string, content: string): Promise<void> {
    await this.stageWrite(relPath, content, undefined, false);
  }

  async writeIfUnchanged(
    relPath: string,
    content: string,
    expectedPreviousContent: string | null,
  ): Promise<void> {
    await this.stageWrite(relPath, content, expectedPreviousContent, true);
  }

  private async stageDelete(
    relPath: string,
    expectedPreviousContent: string | undefined,
    enforceExpected: boolean,
  ): Promise<void> {
    if (this.committed || this.rolledBack) throw new Error("Transaction is no longer active");
    if (this.pendingWrites.has(relPath)) {
      throw new Error(`Path is already staged for writing: ${relPath}`);
    }
    if (this.pendingDeletes.has(relPath)) return;
    const content = await this.readDiskFile(relPath);
    if (
      enforceExpected &&
      (content === undefined || content.toString("utf8") !== expectedPreviousContent)
    ) {
      throw new Error(`File changed before it could be staged: ${relPath}`);
    }
    if (content !== undefined) this.pendingDeletes.set(relPath, content);
  }

  async delete(relPath: string): Promise<void> {
    await this.stageDelete(relPath, undefined, false);
  }

  async deleteIfUnchanged(relPath: string, expectedPreviousContent: string): Promise<void> {
    await this.stageDelete(relPath, expectedPreviousContent, true);
  }

  getStagedDeletes(): string[] {
    return [...this.pendingDeletes.keys()];
  }

  getStagedFiles(): StagedFile[] {
    const out: StagedFile[] = [];
    for (const [path, entry] of this.pendingWrites) {
      out.push({ path, content: entry.content });
    }
    return out;
  }

  getStagedContents(): Map<string, string> {
    const m = new Map<string, string>();
    for (const [p, e] of this.pendingWrites) {
      m.set(p, e.content);
    }
    return m;
  }

  /**
   * Apply-time validation for a staged rename. One canonical target walk also
   * validates the shared parent; the exclusive staging entry is then checked
   * with lstat before the byte CAS and rename.
   */
  private async assertStagedWriteReady(
    relPath: string,
    stagingRelPath: string,
    pending: PendingWrite,
  ): Promise<void> {
    const absPath = await this.assertSafePath(relPath);
    let current: Buffer | undefined;
    try {
      current = await readFile(absPath);
    } catch (error) {
      if ((error as { code?: string })?.code !== "ENOENT") throw error;
    }
    if (pending.wasCreated) {
      if (current !== undefined) throw new Error(`File appeared after it was staged: ${relPath}`);
    } else if (
      current === undefined ||
      pending.previousContent === undefined ||
      !current.equals(pending.previousContent)
    ) {
      throw new Error(`File changed after it was staged: ${relPath}`);
    }

    const staging = await this.assertSafePath(stagingRelPath);
    const stagingInfo = await lstat(staging);
    if (!stagingInfo.isFile() || stagingInfo.isSymbolicLink()) {
      throw new Error(`Refusing to rename a linked or non-file staging entry: ${stagingRelPath}`);
    }
  }

  private async assertDeleteUnchanged(relPath: string, previousContent: Buffer): Promise<void> {
    const current = await this.readDiskFile(relPath);
    if (current === undefined) throw new Error(`File disappeared after it was staged: ${relPath}`);
    if (!current.equals(previousContent)) {
      throw new Error(`File changed after it was staged: ${relPath}`);
    }
  }

  /**
   * Atomically move the current directory entry out of the target namespace,
   * then validate the exact inode that was moved. A read followed by rename or
   * unlink is not a compare-and-swap: another writer can replace the path in
   * between. Capturing first ensures that racing bytes are either put back with
   * an atomic create-if-absent hard link or retained at a reported recovery
   * path; they are never overwritten or deleted. Filesystems without hard-link
   * support therefore fail closed with FsRollbackError/recoveryPath after a
   * capture rather than falling back to a destructive rename or unlink.
   */
  private async quarantineExpectedFile(
    relPath: string,
    expectedContent: Buffer,
    changedMessage: string,
  ): Promise<QuarantinedFile> {
    let quarantine: QuarantinedFile | undefined;
    try {
      quarantine = await this.quarantineCurrentFile(relPath);
      const captured = await this.readDiskFile(quarantine.displacedPath);
      if (captured?.equals(expectedContent)) return quarantine;

      const capturedQuarantine = quarantine;
      // putBackQuarantined either consumes this container or deliberately
      // retains it as the reported recovery path. Do not attempt it twice.
      quarantine = undefined;
      const putBack = await this.putBackQuarantined(relPath, capturedQuarantine);
      if (!putBack.restored) {
        throw new FsRollbackError("Filesystem compare-and-swap conflict requires recovery", {
          success: false,
          restored: [],
          removed: [],
          failures: [
            {
              path: relPath,
              action: "restore",
              reason: "content-changed",
              message: changedMessage,
              recoveryPath: putBack.recoveryPath,
            },
          ],
        });
      }
      throw new Error(changedMessage);
    } catch (error) {
      if (quarantine !== undefined) {
        const putBack = await this.putBackQuarantined(relPath, quarantine);
        if (!putBack.restored) {
          if (error instanceof FsRollbackError) throw error;
          throw new FsRollbackError(
            "Filesystem compare-and-swap failed and captured bytes require recovery",
            {
              success: false,
              restored: [],
              removed: [],
              failures: [
                {
                  path: relPath,
                  action: "restore",
                  reason: "io-error",
                  message: `Could not safely restore ${relPath}: ${this.errorMessage(error)}`,
                  recoveryPath: putBack.recoveryPath,
                },
              ],
            },
            error,
          );
        }
      }
      throw error;
    }
  }

  private errorCode(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private rollbackFailureFor(
    operation: FileOperation,
    reason: RollbackFailureReason,
    message: string,
    recoveryPath?: string,
  ): RollbackFailure {
    return {
      path: operation.path,
      action: operation.kind === "write" && operation.wasCreated ? "remove" : "restore",
      reason,
      message,
      ...(recoveryPath === undefined ? {} : { recoveryPath }),
    };
  }

  private rollbackReason(error: unknown): RollbackFailureReason {
    const message = this.errorMessage(error);
    if (/symbolic link|junction|escapes|unsafe|path traversal/i.test(message)) {
      return "unsafe-path";
    }
    return "io-error";
  }

  private rollbackContainerPath(relPath: string): string {
    const slash = relPath.lastIndexOf("/");
    const parent = slash < 0 ? "" : relPath.slice(0, slash);
    const name = `.ghostinit-rollback-${randomUUID()}`;
    return parent ? `${parent}/${name}` : name;
  }

  private async quarantineCurrentFile(relPath: string): Promise<QuarantinedFile> {
    const containerPath = this.rollbackContainerPath(relPath);
    const source = await this.assertSafePath(relPath);
    const container = this.toAbsolute(containerPath);
    await mkdir(container, { mode: 0o700 });
    await this.rememberCreatedDirectory(container);
    const displacedPath = `${containerPath}/displaced`;
    try {
      // The destination is inside the just-created private directory. The
      // source and its parent were canonicalized immediately before creation.
      const displaced = this.toAbsolute(displacedPath);
      await rename(source, displaced);
      return { containerPath, displacedPath };
    } catch (error) {
      await rmdir(container).catch(() => undefined);
      throw error;
    }
  }

  private async removeQuarantine(quarantine: QuarantinedFile): Promise<void> {
    const container = await this.assertSafePath(quarantine.containerPath);
    const displaced = this.toAbsolute(quarantine.displacedPath);
    const info = await lstat(displaced);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Refusing to remove a linked or non-file rollback entry`);
    }
    await unlink(displaced);
    await rmdir(container);
  }

  /**
   * Put a racing regular file back only if its original path is still absent.
   * `link` is an atomic create-if-absent operation, unlike rename on POSIX
   * where an existing target would be replaced.
   */
  private async putBackQuarantined(
    relPath: string,
    quarantine: QuarantinedFile,
  ): Promise<{ restored: true } | { restored: false; recoveryPath: string }> {
    try {
      const displaced = await this.assertSafePath(quarantine.displacedPath);
      const info = await lstat(displaced);
      if (!info.isFile() || info.isSymbolicLink()) {
        return { restored: false, recoveryPath: quarantine.displacedPath };
      }
      const target = await this.assertSafePath(relPath);
      await link(displaced, target);
      await unlink(displaced);
      const container = await this.assertSafePath(quarantine.containerPath);
      await rmdir(container);
      return { restored: true };
    } catch {
      return { restored: false, recoveryPath: quarantine.displacedPath };
    }
  }

  private async createReplacement(quarantine: QuarantinedFile, content: Buffer): Promise<string> {
    const replacementPath = `${quarantine.containerPath}/replacement`;
    const replacement = await this.assertSafePath(replacementPath);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(replacement, "wx", 0o600);
      await handle.writeFile(content);
      await handle.sync();
      await handle.close();
      return replacementPath;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await unlink(replacement).catch(() => undefined);
      throw error;
    }
  }

  private async removeReplacement(replacementPath: string): Promise<void> {
    const replacement = await this.assertSafePath(replacementPath);
    await unlink(replacement);
  }

  private async restoreDeletedOperation(
    operation: Extract<FileOperation, { kind: "delete" }>,
  ): Promise<OperationRollbackSuccess | RollbackFailure> {
    const current = await this.readDiskFile(operation.path);
    if (current !== undefined) {
      if (current.equals(operation.previousContent)) {
        return { operation, restored: operation.path };
      }
      return this.rollbackFailureFor(
        operation,
        "path-appeared",
        `Refusing to restore a deleted file because another file appeared: ${operation.path}`,
      );
    }

    const quarantine: QuarantinedFile = {
      containerPath: this.rollbackContainerPath(operation.path),
      displacedPath: "",
    };
    const container = await this.assertSafePath(quarantine.containerPath);
    await mkdir(container, { mode: 0o700 });
    await this.rememberCreatedDirectory(container);
    let replacementPath: string | undefined;
    try {
      replacementPath = await this.createReplacement(quarantine, operation.previousContent);
      const replacement = await this.assertSafePath(replacementPath);
      const target = await this.assertSafePath(operation.path);
      await link(replacement, target);
      await this.removeReplacement(replacementPath);
      replacementPath = undefined;
      await rmdir(container);
      return { operation, restored: operation.path };
    } catch (error) {
      if (replacementPath !== undefined) {
        await this.removeReplacement(replacementPath).catch(() => undefined);
      }
      await rmdir(container).catch(() => undefined);
      const after = await this.readDiskFile(operation.path).catch(() => undefined);
      if (after?.equals(operation.previousContent)) {
        return { operation, restored: operation.path };
      }
      const appeared = this.errorCode(error) === "EEXIST" || after !== undefined;
      return this.rollbackFailureFor(
        operation,
        appeared ? "path-appeared" : this.rollbackReason(error),
        appeared
          ? `Refusing to restore a deleted file because another file appeared: ${operation.path}`
          : `Could not restore deleted file ${operation.path}: ${this.errorMessage(error)}`,
      );
    }
  }

  private async removeCreatedOperation(
    operation: Extract<FileOperation, { kind: "write" }>,
  ): Promise<OperationRollbackSuccess | RollbackFailure> {
    const current = await this.readDiskFile(operation.path);
    if (current === undefined) return { operation, removed: operation.path };
    if (!current.equals(operation.writtenContent)) {
      return this.rollbackFailureFor(
        operation,
        "content-changed",
        `Refusing to remove a created file whose bytes changed after commit: ${operation.path}`,
      );
    }

    let quarantine: QuarantinedFile | undefined;
    try {
      quarantine = await this.quarantineCurrentFile(operation.path);
      const displaced = await this.readDiskFile(quarantine.displacedPath);
      if (displaced === undefined || !displaced.equals(operation.writtenContent)) {
        const putBack = await this.putBackQuarantined(operation.path, quarantine);
        return this.rollbackFailureFor(
          operation,
          "content-changed",
          `Refusing to remove a created file that changed during rollback: ${operation.path}`,
          putBack.restored ? undefined : putBack.recoveryPath,
        );
      }
      await this.removeQuarantine(quarantine);
      return { operation, removed: operation.path };
    } catch (error) {
      let recoveryPath: string | undefined;
      if (quarantine !== undefined) {
        const putBack = await this.putBackQuarantined(operation.path, quarantine);
        if (!putBack.restored) recoveryPath = putBack.recoveryPath;
      }
      return this.rollbackFailureFor(
        operation,
        this.rollbackReason(error),
        `Could not remove transaction-created file ${operation.path}: ${this.errorMessage(error)}`,
        recoveryPath,
      );
    }
  }

  private async restoreOverwrittenOperation(
    operation: Extract<FileOperation, { kind: "write" }>,
  ): Promise<OperationRollbackSuccess | RollbackFailure> {
    const previousContent = operation.previousContent;
    if (previousContent === undefined) {
      return this.rollbackFailureFor(
        operation,
        "io-error",
        `Rollback metadata is missing the previous bytes for ${operation.path}`,
      );
    }
    const current = await this.readDiskFile(operation.path);
    if (current?.equals(previousContent)) {
      return { operation, restored: operation.path };
    }
    if (current === undefined) {
      return this.rollbackFailureFor(
        operation,
        "path-missing",
        `Refusing to restore an overwritten file that disappeared after commit: ${operation.path}`,
      );
    }
    if (!current.equals(operation.writtenContent)) {
      return this.rollbackFailureFor(
        operation,
        "content-changed",
        `Refusing to restore an overwritten file whose bytes changed after commit: ${operation.path}`,
      );
    }

    let quarantine: QuarantinedFile | undefined;
    let replacementPath: string | undefined;
    try {
      quarantine = await this.quarantineCurrentFile(operation.path);
      const displaced = await this.readDiskFile(quarantine.displacedPath);
      if (displaced === undefined || !displaced.equals(operation.writtenContent)) {
        const putBack = await this.putBackQuarantined(operation.path, quarantine);
        return this.rollbackFailureFor(
          operation,
          "content-changed",
          `Refusing to restore a file that changed during rollback: ${operation.path}`,
          putBack.restored ? undefined : putBack.recoveryPath,
        );
      }

      replacementPath = await this.createReplacement(quarantine, previousContent);
      const replacement = await this.assertSafePath(replacementPath);
      const target = await this.assertSafePath(operation.path);
      await link(replacement, target);
      await this.removeReplacement(replacementPath);
      replacementPath = undefined;
      await this.removeQuarantine(quarantine);
      return { operation, restored: operation.path };
    } catch (error) {
      if (replacementPath !== undefined) {
        await this.removeReplacement(replacementPath).catch(() => undefined);
      }
      let recoveryPath: string | undefined;
      if (quarantine !== undefined) {
        const displaced = await this.readDiskFile(quarantine.displacedPath).catch(() => undefined);
        if (displaced?.equals(operation.writtenContent)) {
          await this.removeQuarantine(quarantine).catch(() => undefined);
        } else {
          const putBack = await this.putBackQuarantined(operation.path, quarantine);
          if (!putBack.restored) recoveryPath = putBack.recoveryPath;
        }
      }
      const after = await this.readDiskFile(operation.path).catch(() => undefined);
      if (after?.equals(previousContent)) {
        return { operation, restored: operation.path };
      }
      const appeared = this.errorCode(error) === "EEXIST" || after !== undefined;
      return this.rollbackFailureFor(
        operation,
        appeared ? "path-appeared" : this.rollbackReason(error),
        appeared
          ? `Refusing to replace a file that appeared during rollback: ${operation.path}`
          : `Could not restore overwritten file ${operation.path}: ${this.errorMessage(error)}`,
        recoveryPath,
      );
    }
  }

  private async rollbackOperation(
    operation: FileOperation,
  ): Promise<OperationRollbackSuccess | RollbackFailure> {
    try {
      if (operation.kind === "delete") return await this.restoreDeletedOperation(operation);
      if (operation.wasCreated) return await this.removeCreatedOperation(operation);
      return await this.restoreOverwrittenOperation(operation);
    } catch (error) {
      return this.rollbackFailureFor(
        operation,
        this.rollbackReason(error),
        `Could not roll back ${operation.path}: ${this.errorMessage(error)}`,
      );
    }
  }

  private async rollbackOperations(operations: readonly FileOperation[]): Promise<RollbackAttempt> {
    const attempt: RollbackAttempt = {
      restored: [],
      removed: [],
      completed: [],
      failures: [],
    };
    for (let index = operations.length - 1; index >= 0; index--) {
      const outcome = await this.rollbackOperation(operations[index]);
      if ("reason" in outcome) {
        attempt.failures.push(outcome);
        continue;
      }
      attempt.completed.push(outcome.operation);
      if (outcome.restored !== undefined) attempt.restored.push(outcome.restored);
      if (outcome.removed !== undefined) attempt.removed.push(outcome.removed);
    }
    return attempt;
  }

  private forgetCompletedOperations(completed: readonly FileOperation[]): void {
    const completedSet = new Set(completed);
    for (let index = this.operations.length - 1; index >= 0; index--) {
      if (completedSet.has(this.operations[index])) this.operations.splice(index, 1);
    }
  }

  async commit(): Promise<{ written: string[] }> {
    if (this.rollbackFailure !== undefined) {
      throw new Error("Cannot commit a transaction whose rollback failed", {
        cause: this.rollbackFailure,
      });
    }
    if (this.rolledBack) {
      throw new Error("Cannot commit a rolled-back transaction");
    }
    if (this.committed) {
      throw new Error("Transaction already committed");
    }

    if (this.pendingWrites.size === 0 && this.pendingDeletes.size === 0) {
      this.committed = true;
      return { written: this.operations.map((op) => op.path) };
    }

    // Proactively clean old stale staging files before starting new writes
    await this.cleanupStaleStaging().catch(() => {
      // ignore
    });

    const stagingFilesCreated: string[] = [];
    const appliedQuarantines: QuarantinedFile[] = [];
    try {
      for (const [relPath, pending] of this.pendingWrites) {
        const absPath = this.toAbsolute(relPath);
        const dirs = await this.ensureDirs(dirname(absPath));
        this.createdDirs.push(...dirs);

        const stagingRelPath = `${relPath}${STAGING_SUFFIX}`;
        const staging = this.toAbsolute(stagingRelPath);
        let handle: Awaited<ReturnType<typeof open>> | undefined;
        let ownsStagingFile = false;
        let previousQuarantine: QuarantinedFile | undefined;
        try {
          // Exclusive creation prevents a pre-positioned staging symlink from
          // being followed even if it appears immediately after validation.
          handle = await open(staging, "wx", 0o600);
          ownsStagingFile = true;
          await handle.writeFile(pending.content, "utf-8");
          await handle.close();
          handle = undefined;
          stagingFilesCreated.push(stagingRelPath);
          await this.assertStagedWriteReady(relPath, stagingRelPath, pending);

          const target = await this.assertSafePath(relPath);
          if (pending.wasCreated) {
            // link is an atomic create-if-absent operation. A rename would
            // overwrite a file that appeared after the preceding validation.
            await link(staging, target);
          } else {
            if (pending.previousContent === undefined) {
              throw new Error(`Missing previous bytes for staged write: ${relPath}`);
            }
            previousQuarantine = await this.quarantineExpectedFile(
              relPath,
              pending.previousContent,
              `File changed while the staged write was being applied: ${relPath}`,
            );
            try {
              // The target is absent after quarantine. Hard-linking the staged
              // inode installs only if no racing writer has claimed the path.
              await link(staging, target);
            } catch (error) {
              const putBack = await this.putBackQuarantined(relPath, previousQuarantine);
              if (!putBack.restored) {
                throw new FsRollbackError(
                  "Staged write conflicted with a racing file and requires recovery",
                  {
                    success: false,
                    restored: [],
                    removed: [],
                    failures: [
                      {
                        path: relPath,
                        action: "restore",
                        reason: "path-appeared",
                        message: `A file appeared while applying the staged write: ${relPath}`,
                        recoveryPath: putBack.recoveryPath,
                      },
                    ],
                  },
                  error,
                );
              }
              previousQuarantine = undefined;
              throw error;
            }
          }

          // Record the applied mutation before any fallible artifact cleanup so
          // the outer compensating rollback always sees the complete prefix.
          this.operations.push({
            path: relPath,
            kind: "write",
            previousContent: pending.previousContent,
            wasCreated: pending.wasCreated,
            writtenContent: Buffer.from(pending.content, "utf8"),
          });
          if (previousQuarantine !== undefined) appliedQuarantines.push(previousQuarantine);

          await this.removeStagingEntry(stagingRelPath);
          ownsStagingFile = false;
          const idx = stagingFilesCreated.indexOf(stagingRelPath);
          if (idx >= 0) stagingFilesCreated.splice(idx, 1);
          if (previousQuarantine !== undefined) {
            await this.removeQuarantine(previousQuarantine);
            const quarantineIndex = appliedQuarantines.indexOf(previousQuarantine);
            if (quarantineIndex >= 0) appliedQuarantines.splice(quarantineIndex, 1);
            previousQuarantine = undefined;
          }
        } catch (writeErr) {
          await handle?.close().catch(() => undefined);
          // Remove only a staging file whose exclusive creation succeeded in
          // this transaction. An EEXIST entry may belong to a live peer.
          if (ownsStagingFile) {
            try {
              await this.removeStagingEntry(stagingRelPath);
            } catch {
              // ignore
            }
          }
          throw writeErr;
        }
      }
      for (const [relPath, previousContent] of this.pendingDeletes) {
        await this.assertDeleteUnchanged(relPath, previousContent);
        const quarantine = await this.quarantineExpectedFile(
          relPath,
          previousContent,
          `File changed while the staged deletion was being applied: ${relPath}`,
        );
        appliedQuarantines.push(quarantine);
        this.operations.push({
          path: relPath,
          kind: "delete",
          previousContent,
          wasCreated: false,
        });
        await this.removeQuarantine(quarantine);
        const quarantineIndex = appliedQuarantines.indexOf(quarantine);
        if (quarantineIndex >= 0) appliedQuarantines.splice(quarantineIndex, 1);
      }
      this.pendingWrites.clear();
      this.pendingDeletes.clear();
      this.committed = true;
      return { written: this.operations.map((op) => op.path) };
    } catch (err) {
      // A failed commit may already have installed a prefix of the plan. Undo
      // only bytes that still match that prefix; never overwrite a racing edit.
      const rollbackAttempt = await this.rollbackOperations([...this.operations]);
      this.forgetCompletedOperations(rollbackAttempt.completed);
      // Cleanup any staging files left from this failed commit attempt
      for (const stagingRelPath of stagingFilesCreated) {
        try {
          await this.removeStagingEntry(stagingRelPath);
        } catch {
          // ignore
        }
      }
      // These containers belong only to already-recorded operations. Their
      // previous bytes are also held in operation metadata for compensation.
      for (const quarantine of appliedQuarantines) {
        await this.removeQuarantine(quarantine).catch(() => undefined);
      }
      // Also cleanup any old stale staging files
      await this.cleanupStaleStaging().catch(() => {});

      // Attempt to clean dirs created in this commit
      const uniqueDirs = [...new Set(this.createdDirs)];
      uniqueDirs.sort((a, b) => b.length - a.length);
      for (const absDir of uniqueDirs) {
        try {
          await this.assertSafeDirectory(absDir);
          await rmdir(absDir);
        } catch {
          // ignore
        }
      }
      if (rollbackAttempt.failures.length > 0) {
        const failure = new FsRollbackError(
          "Commit failed and its compensating rollback was incomplete",
          {
            success: false,
            restored: rollbackAttempt.restored,
            removed: rollbackAttempt.removed,
            failures: rollbackAttempt.failures,
          },
          err,
        );
        this.rollbackFailure = failure;
        throw failure;
      }
      throw err;
    }
  }

  async rollback(): Promise<RollbackResult> {
    if (this.rollbackFailure !== undefined) throw this.rollbackFailure;
    if (this.rollbackResult !== undefined) return this.rollbackResult;

    const rollbackAttempt = await this.rollbackOperations([...this.operations]);
    this.forgetCompletedOperations(rollbackAttempt.completed);
    this.pendingWrites.clear();
    this.pendingDeletes.clear();

    const uniqueDirs = [...new Set(this.createdDirs)];
    uniqueDirs.sort((a, b) => b.length - a.length);
    for (const absDir of uniqueDirs) {
      try {
        await this.assertSafeDirectory(absDir);
        await rmdir(absDir);
      } catch {
        // ignore
      }
    }

    // Final safety: clean any stale staging leftovers after rollback
    await this.cleanupStaleStaging().catch(() => {});

    if (rollbackAttempt.failures.length > 0) {
      const failure = new FsRollbackError("Filesystem rollback was incomplete", {
        success: false,
        restored: rollbackAttempt.restored,
        removed: rollbackAttempt.removed,
        failures: rollbackAttempt.failures,
      });
      this.rollbackFailure = failure;
      throw failure;
    }

    this.rolledBack = true;
    this.rollbackResult = {
      success: true,
      restored: rollbackAttempt.restored,
      removed: rollbackAttempt.removed,
      failures: [],
    };
    return this.rollbackResult;
  }

  get stagedPaths(): readonly string[] {
    if (this.pendingWrites.size > 0) {
      return [...this.pendingWrites.keys(), ...this.pendingDeletes.keys()];
    }
    if (this.pendingDeletes.size > 0) return [...this.pendingDeletes.keys()];
    return this.operations.map((op) => op.path);
  }

  private async ensureDirs(absDir: string): Promise<string[]> {
    const created: string[] = [];
    const absolute = resolve(absDir);
    const rel = relative(this.root, absolute);
    if (rel === "") {
      await this.assertCurrentRoot();
      return created;
    }
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`Directory escapes project root: ${absDir}`);
    }
    const safeRel = rel.split(sep).join("/");
    // Validate the deepest existing parent before creating anything. This is
    // one canonical walk for the whole chain instead of two walks per segment.
    await this.assertSafePath(safeRel);
    const segments = rel.split(sep).filter(Boolean);
    let current = this.root;
    for (const segment of segments) {
      current = join(current, segment);
      let made = false;
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        info = await lstat(current);
      } catch (error) {
        if ((error as { code?: string })?.code !== "ENOENT") throw error;
        await mkdir(current);
        made = true;
        info = await lstat(current);
      }
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Refusing to use a linked or non-directory parent: ${safeRel}`);
      }
      if (made) created.push(current);
    }

    // Newly-created components are verified before the caller opens a staging
    // file. Existing chains were already verified above.
    if (created.length > 0) await this.assertSafePath(safeRel);

    return created;
  }
}
