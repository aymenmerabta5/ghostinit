/**
 * ghostinit check implementation.
 */

import { ExitCode } from "../lib/errors.js";
import { analyzeProject } from "../lib/architecture.js";
import { envelope, printJson } from "../lib/json.js";
import { loadState } from "../lib/state.js";
import type { GlobalOptions } from "./types.js";

export async function checkCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();

  const state = await loadState(options.cwd);
  if (!state) {
    throw new Error("No GhostInit project found in the current directory");
  }

  const findings = await analyzeProject(options.cwd);
  const blockers = findings.filter((f) => f.severity === "BLOCKER").length;
  const highs = findings.filter((f) => f.severity === "HIGH").length;
  const mediums = findings.filter((f) => f.severity === "MEDIUM").length;

  const passed = blockers === 0 && highs === 0;

  if (options.json) {
    printJson(
      envelope({
        success: passed,
        exitCode: passed ? ExitCode.OK : ExitCode.GENERAL_ERROR,
        data: { findings, summary: { blockers, highs, mediums } },
        command: "check",
        durationMs: Date.now() - start,
      }),
    );
    return passed ? ExitCode.OK : ExitCode.GENERAL_ERROR;
  }

  for (const finding of findings) {
    options.logger[finding.severity === "LOW" ? "warn" : "error"](
      `[${finding.severity}] ${finding.message} (${finding.rule})`,
      { file: finding.file },
    );
  }

  return passed ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
