/**
 * ghostinit status implementation.
 */

import { ExitCode } from "../lib/errors.js";
import { loadState } from "../lib/state.js";
import { lockPath } from "../lib/lock.js";
import { existsSync } from "node:fs";
import { envelope, printJson } from "../lib/json.js";
import type { GlobalOptions } from "./types.js";

interface StatusReport {
  project: string;
  runtime: string;
  version: string;
  modules: string[];
  generatedAt: string;
  lockActive: boolean;
}

export async function statusCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const state = await loadState(options.cwd);
  const lockActive = existsSync(lockPath(options.cwd));

  const report: StatusReport = {
    project: state?.project.name ?? "",
    runtime: state?.project.runtime ?? "",
    version: state?.project.version ?? "",
    modules: state?.modules ?? [],
    generatedAt: state?.generatedAt ?? "",
    lockActive,
  };

  if (!state) {
    options.logger.warn("No GhostInit project state found");
  }

  if (options.json) {
    printJson(
      envelope({
        success: !!state,
        exitCode: state ? ExitCode.OK : ExitCode.GENERAL_ERROR,
        data: report,
        command: "status",
        durationMs: Date.now() - start,
      }),
    );
  } else {
    options.logger.info(`Project: ${report.project || "unknown"}`);
    options.logger.info(`Runtime: ${report.runtime || "unknown"}`);
    options.logger.info(`Modules: ${(report.modules || []).join(", ")}`);
    options.logger.info(`Lock active: ${report.lockActive}`);
  }

  return state ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
