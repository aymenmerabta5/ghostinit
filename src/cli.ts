#!/usr/bin/env bun
/**
 * GhostInit CLI entry — slim orchestrator delegating to src/cli/* modules.
 * Keeps bin compatibility: dist/cli.js is bundled from this file.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main } from "./cli/index.js";
import { ExitCode, exitCodeName } from "./lib/errors.js";
import { envelope, printJson } from "./lib/json.js";

function isDirectCliInvocation(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  try {
    const isEntryFile = realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
    return isEntryFile && (import.meta.main === true || typeof import.meta.main === "undefined");
  } catch {
    return false;
  }
}

if (isDirectCliInvocation()) {
  void main(process.argv).then(
    (code) => process.exit(code),
    (error) => {
      const isJson = process.argv.includes("--json");
      const msg = String(error instanceof Error ? error.message : error);
      if (isJson) {
        try {
          printJson(
            envelope({
              success: false,
              exitCode: ExitCode.INVALID_ARGUMENTS,
              error: { message: msg, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
              command: "unknown",
              durationMs: 0,
            }),
          );
        } catch {}
      } else {
        process.stderr.write(msg + "\n");
      }
      const maybeErr = error as { code?: string; message?: string };
      const codeProp = maybeErr?.code;
      if (
        codeProp === "ERR_PARSE_ARGS_UNKNOWN_OPTION" ||
        codeProp === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
      ) {
        process.exit(ExitCode.INVALID_ARGUMENTS);
      }
      process.exit(ExitCode.GENERAL_ERROR);
    },
  );
}

export { main } from "./cli/index.js";
