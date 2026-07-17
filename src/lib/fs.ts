/**
 * Transactional filesystem helpers.
 *
 * A transaction records every write so an unexpected error or cancellation
 * can roll the project back to its previous state. Paths are stored as POSIX
 * relative paths internally, then resolved against the project root.
 */

import { access, mkdir, rm, rmdir, writeFile, readFile, rename } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export interface FileOperation {
  path: string;
  previousContent?: Buffer;
  wasCreated: boolean;
}

export class FsTransaction {
  private readonly root: string;
  private readonly operations: FileOperation[] = [];
  private readonly createdDirs: string[] = [];
  private committed = false;
  private rolledBack = false;

  constructor(root: string) {
    this.root = root;
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
    try {
      await readFile(this.toAbsolute(relPath));
      return true;
    } catch {
      return false;
    }
  }

  async readText(relPath: string): Promise<string | undefined> {
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

    const absPath = this.toAbsolute(relPath);
    const dirs = await this.ensureDirs(dirname(absPath));
    this.createdDirs.push(...dirs);

    let previousContent: Buffer | undefined;
    let wasCreated = true;
    try {
      previousContent = await readFile(absPath);
      wasCreated = false;
    } catch {
      previousContent = undefined;
    }

    if (previousContent && previousContent.toString("utf-8") === content) {
      // Content unchanged; do not record operation.
      return;
    }

    // Write to a staging path first, then rename atomically.
    const staging = `${absPath}.ghostinit-staging`;
    await writeFile(staging, content, "utf-8");
    await rename(staging, absPath);

    this.operations.push({ path: relPath, previousContent, wasCreated });
  }

  async commit(): Promise<{ written: string[] }> {
    if (this.rolledBack) {
      throw new Error("Cannot commit a rolled-back transaction");
    }
    this.committed = true;
    return { written: this.operations.map((op) => op.path) };
  }

  async rollback(): Promise<{ restored: string[]; removed: string[] }> {
    if (this.committed) {
      throw new Error("Cannot rollback a committed transaction");
    }
    this.rolledBack = true;

    const restored: string[] = [];
    const removed: string[] = [];

    // Rollback files in reverse order.
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];
      const absPath = this.toAbsolute(op.path);
      if (op.wasCreated) {
        await rm(absPath, { force: true });
        removed.push(op.path);
      } else if (op.previousContent) {
        await writeFile(absPath, op.previousContent);
        restored.push(op.path);
      }
    }

    // Remove directories created by this transaction if they are now empty.
    const uniqueDirs = [...new Set(this.createdDirs)];
    uniqueDirs.sort((a, b) => b.length - a.length);
    for (const absDir of uniqueDirs) {
      try {
        await rmdir(absDir);
      } catch {
        // Directory not empty or already removed; ignore.
      }
    }

    return { restored, removed };
  }

  get stagedPaths(): readonly string[] {
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
