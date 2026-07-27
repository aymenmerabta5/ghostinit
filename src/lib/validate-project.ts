/**
 * Shared pre-mutation validation for GhostInit projects.
 *
 * Used by `add` and `sync` to fail early if the project state is missing,
 * package.json is unparseable, or tracked files drift from state.json.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadState } from "./state.js";
import { hashContent, isDriftTracked } from "./checksum.js";
import { ExitCode } from "./errors.js";
import type { State } from "./config.js";

export interface ValidatedProject {
  valid: true;
  state: State;
}

export interface ProjectValidationFailure {
  valid: false;
  exitCodeSuggestion: number;
  message: string;
  error?: Error;
  details?: Record<string, unknown>;
}

export async function validateProjectForMutation(
  cwd: string,
): Promise<ValidatedProject | ProjectValidationFailure> {
  const packageJsonPath = join(cwd, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const text = await readFile(packageJsonPath, "utf-8");
      JSON.parse(text);
    } catch (err) {
      return {
        valid: false,
        exitCodeSuggestion: ExitCode.INVALID_STATE,
        message: `package.json is corrupt: ${err instanceof Error ? err.message : String(err)}`,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  const state = await loadState(cwd);
  if (!state) {
    return {
      valid: false,
      exitCodeSuggestion: ExitCode.GENERAL_ERROR,
      message: "No GhostInit project found in the current directory",
    };
  }

  const drift: string[] = [];
  for (const [relPath, entry] of Object.entries(state.checksums)) {
    // Ignore entries outside the sync-owned registries. Projects created by an
    // older CLI have all ~256 generated files checksummed here; without this
    // filter they stay permanently bricked (exit 23) after upgrading, because
    // the user has since edited .env.local and their own app source.
    if (!isDriftTracked(relPath)) continue;
    const absPath = join(cwd, ...relPath.split("/"));
    if (!existsSync(absPath)) {
      drift.push(`${relPath}: missing`);
      continue;
    }
    try {
      const content = await readFile(absPath, "utf-8");
      const actual = hashContent(content);
      if (actual !== entry.hash) {
        drift.push(`${relPath}: modified externally`);
      }
    } catch (err) {
      drift.push(`${relPath}: unreadable (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  if (drift.length > 0) {
    return {
      valid: false,
      exitCodeSuggestion: ExitCode.INVALID_STATE,
      message: `State file does not match filesystem. Regenerate with ghostinit sync or restore tracked files. Drift: ${drift.join("; ")}`,
      details: { drift },
    };
  }

  return { valid: true, state };
}
