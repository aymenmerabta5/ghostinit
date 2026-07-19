/**
 * Transactional filesystem helpers.
 *
 * A transaction records every write so an unexpected error or cancellation
 * can roll the project back to its previous state. Paths are stored as POSIX
 * relative paths internally, then resolved against the project root.
 */

import {
  access,
  mkdir,
  rm,
  rmdir,
  writeFile,
  readFile,
  rename,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { STAGING_SUFFIX, STAGING_TTL_MS } from "./constants.js";

export interface FileOperation {
  path: string;
  previousContent?: Buffer;
  wasCreated: boolean;
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

export class FsTransaction {
  private readonly root: string;
  private readonly operations: FileOperation[] = [];
  private readonly createdDirs: string[] = [];
  private readonly pendingWrites: Map<string, PendingWrite> = new Map();
  private committed = false;
  private rolledBack = false;

  constructor(root: string) {
    this.root = root;
    // Best-effort background cleanup of stale staging files left by crashed previous runs.
    // Don't block constructor; fire-and-forget but swallow errors.
    // The commit path also calls cleanupStaleStaging synchronously before writing.
    void this.cleanupStaleStaging().catch(() => {
      // ignore
    });
  }

  /**
   * Scan root for any .ghostinit-staging files/dirs leftover from a killed process
   * and remove them if older than STAGING_TTL_MS (1 hour).
   * This prevents accumulation of staging files after crashes between writeFile(staging) and rename().
   */
  async cleanupStaleStaging(): Promise<{ removed: string[] }> {
    const removed: string[] = [];
    const now = Date.now();
    try {
      const entries = await this.recursiveFindStaging(this.root);
      for (const absPath of entries) {
        try {
          const s = await stat(absPath);
          const age = now - s.mtimeMs;
          if (age > STAGING_TTL_MS) {
            // Remove file or dir recursively
            if (s.isDirectory()) {
              await rm(absPath, { recursive: true, force: true });
            } else {
              await unlink(absPath).catch(() => rm(absPath, { force: true }));
            }
            removed.push(relative(this.root, absPath).split(sep).join("/"));
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
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return results;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      // Fast path: check name contains staging suffix
      if (entry.includes(STAGING_SUFFIX) || entry.startsWith(".ghostinit-staging")) {
        results.push(abs);
        // If it's a dir with staging name, still try to scan inside? but we will rm recursively, so skip recursion for matched entries that are dirs? We'll still collect but not recurse to save time, because rm recursive will delete contents.
        // However for files we also don't need to recurse.
        // For directories that contain staging substring, we intentionally do not recurse deeper because rm recursive covers it, but we still want to find nested staging inside non-staging dirs.
        // So if entry itself is staging, we don't need to recurse inside it (would be deleted anyway).
        // Continue to next entry.
        // To avoid double-categorization, check if it's directory but matches staging -> don't recurse
        try {
          const st = await stat(abs);
          if (st.isDirectory()) {
            continue;
          }
        } catch {
          // ignore
        }
      }
      // Recurse into non-staging directories (skip node_modules, .git, .next, dist, etc to keep scan cheap)
      if (
        entry === "node_modules" ||
        entry === ".git" ||
        entry === ".next" ||
        entry === "dist" ||
        entry === ".output" ||
        entry === ".vercel" ||
        entry === ".turbo"
      ) {
        continue;
      }
      try {
        const s = await stat(abs);
        if (s.isDirectory()) {
          const nested = await this.recursiveFindStaging(abs);
          results.push(...nested);
        }
      } catch {
        // ignore
      }
    }
    return results;
  }

  toAbsolute(relPath: string): string {
    // Reject path traversal and absolute paths before resolving against root.
    if (relPath.startsWith("/") || relPath.startsWith("\\\\") || /^[a-zA-Z]:/.test(relPath)) {
      throw new Error(`Unsafe absolute path: ${relPath}`);
    }
    if (relPath.split("/").includes("..") || relPath.split("\\").includes("..")) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    const resolved = join(this.root, relPath.split("/").join(sep));
    const realRoot = resolve(this.root);
    if (!resolve(resolved).startsWith(realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`)) {
      throw new Error(`Path escapes project root: ${relPath}`);
    }
    return resolved;
  }

  toRelative(absPath: string): string {
    return relative(this.root, absPath).split(sep).join("/");
  }

  async exists(relPath: string): Promise<boolean> {
    if (this.pendingWrites.has(relPath)) {
      return true;
    }
    try {
      await readFile(this.toAbsolute(relPath));
      return true;
    } catch {
      return false;
    }
  }

  async readText(relPath: string): Promise<string | undefined> {
    const pending = this.pendingWrites.get(relPath);
    if (pending) {
      return pending.content;
    }
    try {
      return await readFile(this.toAbsolute(relPath), "utf-8");
    } catch {
      return undefined;
    }
  }

  async write(relPath: string, content: string): Promise<void> {
    if (this.committed || this.rolledBack) {
      throw new Error("Transaction is no longer active");
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

    const absPath = this.toAbsolute(relPath);
    let previousContent: Buffer | undefined;
    let wasCreated = true;
    try {
      previousContent = await readFile(absPath);
      wasCreated = false;
      if (previousContent.toString("utf-8") === content) {
        return;
      }
    } catch {
      previousContent = undefined;
      wasCreated = true;
    }

    this.pendingWrites.set(relPath, { content, previousContent, wasCreated });
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

  async commit(): Promise<{ written: string[] }> {
    if (this.rolledBack) {
      throw new Error("Cannot commit a rolled-back transaction");
    }
    if (this.committed) {
      throw new Error("Transaction already committed");
    }

    if (this.pendingWrites.size === 0) {
      this.committed = true;
      return { written: this.operations.map((op) => op.path) };
    }

    // Proactively clean old stale staging files before starting new writes
    await this.cleanupStaleStaging().catch(() => {
      // ignore
    });

    const writtenInThisCommit: string[] = [];
    const stagingFilesCreated: string[] = [];
    try {
      for (const [relPath, pending] of this.pendingWrites) {
        const absPath = this.toAbsolute(relPath);
        const dirs = await this.ensureDirs(dirname(absPath));
        this.createdDirs.push(...dirs);

        const staging = `${absPath}${STAGING_SUFFIX}`;
        try {
          await writeFile(staging, pending.content, "utf-8");
          stagingFilesCreated.push(staging);
          await rename(staging, absPath);
          // Remove from list after successful rename (already moved)
          const idx = stagingFilesCreated.indexOf(staging);
          if (idx >= 0) stagingFilesCreated.splice(idx, 1);
        } catch (writeErr) {
          // Ensure staging file is removed on failure
          try {
            await rm(staging, { force: true });
          } catch {
            // ignore
          }
          throw writeErr;
        }

        this.operations.push({
          path: relPath,
          previousContent: pending.previousContent,
          wasCreated: pending.wasCreated,
        });
        writtenInThisCommit.push(relPath);
      }
      this.pendingWrites.clear();
      this.committed = true;
      return { written: this.operations.map((op) => op.path) };
    } catch (err) {
      // Partial failure: rollback files written in this commit attempt
      for (let i = writtenInThisCommit.length - 1; i >= 0; i--) {
        const rel = writtenInThisCommit[i];
        const op = this.operations.find((o) => o.path === rel);
        const absPath = this.toAbsolute(rel);
        try {
          if (op?.wasCreated) {
            await rm(absPath, { force: true });
          } else if (op?.previousContent) {
            await writeFile(absPath, op.previousContent);
          }
        } catch {
          // ignore cleanup errors
        }
      }
      // Remove from operations the ones we rolled back in this attempt
      for (const p of writtenInThisCommit) {
        const idx = this.operations.findIndex((o) => o.path === p);
        if (idx >= 0) this.operations.splice(idx, 1);
      }
      // Cleanup any staging files left from this failed commit attempt
      for (const stagingPath of stagingFilesCreated) {
        try {
          await rm(stagingPath, { force: true });
        } catch {
          // ignore
        }
      }
      // Also cleanup any old stale staging files
      await this.cleanupStaleStaging().catch(() => {});

      // Attempt to clean dirs created in this commit
      const uniqueDirs = [...new Set(this.createdDirs)];
      uniqueDirs.sort((a, b) => b.length - a.length);
      for (const absDir of uniqueDirs) {
        try {
          await rmdir(absDir);
        } catch {
          // ignore
        }
      }
      throw err;
    }
  }

  async rollback(): Promise<{ restored: string[]; removed: string[] }> {
    if (this.rolledBack) {
      return { restored: [], removed: [] };
    }
    this.rolledBack = true;

    const restored: string[] = [];
    const removed: string[] = [];

    if (!this.committed) {
      // Nothing written to disk yet, just clear pending
      this.pendingWrites.clear();
      // Clean any staging files that might exist from partial previous commit attempts
      await this.cleanupStaleStaging().catch(() => {});
      // No dirs created yet (ensureDirs deferred to commit), but clean any that might have been partially created
      const uniqueDirs = [...new Set(this.createdDirs)];
      uniqueDirs.sort((a, b) => b.length - a.length);
      for (const absDir of uniqueDirs) {
        try {
          await rmdir(absDir);
        } catch {
          // ignore
        }
      }
      return { restored, removed };
    }

    // Committed case: revert files in reverse order
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];
      const absPath = this.toAbsolute(op.path);
      try {
        if (op.wasCreated) {
          await rm(absPath, { force: true });
          removed.push(op.path);
        } else if (op.previousContent) {
          await writeFile(absPath, op.previousContent);
          restored.push(op.path);
        }
      } catch {
        // ignore rollback errors
      }
    }

    const uniqueDirs = [...new Set(this.createdDirs)];
    uniqueDirs.sort((a, b) => b.length - a.length);
    for (const absDir of uniqueDirs) {
      try {
        await rmdir(absDir);
      } catch {
        // ignore
      }
    }

    // Final safety: clean any stale staging leftovers after rollback
    await this.cleanupStaleStaging().catch(() => {});

    return { restored, removed };
  }

  get stagedPaths(): readonly string[] {
    if (this.pendingWrites.size > 0) {
      return Array.from(this.pendingWrites.keys());
    }
    return this.operations.map((op) => op.path);
  }

  private async ensureDirs(absDir: string): Promise<string[]> {
    const created: string[] = [];
    const stack: string[] = [];
    let curr = absDir;
    while (curr !== this.root && !curr.endsWith(":" + sep) && curr.length > 0) {
      stack.unshift(curr);
      const parent = dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }

    for (const dir of stack) {
      try {
        await access(dir);
      } catch {
        await mkdir(dir, { recursive: true });
        created.push(dir);
      }
    }

    return created;
  }
}
