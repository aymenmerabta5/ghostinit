/**
 * Git safety helpers.
 *
 * - Detect dirty worktrees.
 * - Detect whether a path is inside a Git repository.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitDirtyError } from "./errors.js";
import type { Logger } from "./logger.js";

const exec = promisify(execFile);

export interface GitStatus {
  isRepo: boolean;
  dirty: boolean;
  untracked: string[];
  modified: string[];
}

export async function checkGitStatus(root: string, logger: Logger): Promise<GitStatus> {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: root,
    });
    const lines = stdout.split("\n").filter(Boolean);
    const untracked: string[] = [];
    const modified: string[] = [];

    for (const line of lines) {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      if (status.includes("?")) {
        untracked.push(file);
      } else {
        modified.push(file);
      }
    }

    return {
      isRepo: true,
      dirty: lines.length > 0,
      untracked,
      modified,
    };
  } catch (err) {
    logger.debug("Git status check failed (not a repository?)", { root, cause: String(err) });
    return { isRepo: false, dirty: false, untracked: [], modified: [] };
  }
}

export function assertCleanGit(
  status: GitStatus,
  allowDirty = false,
  logger = undefined as unknown as Logger,
): void {
  if (status.dirty && !allowDirty) {
    if (logger) {
      logger.warn("Dirty Git worktree detected; use --force to override", {
        modified: status.modified,
        untracked: status.untracked,
      });
    }
    throw new GitDirtyError("Refusing to modify a dirty Git worktree without --force");
  }
}
