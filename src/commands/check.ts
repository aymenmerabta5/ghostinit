/**
 * ghostinit check implementation.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ExitCode, ProjectStateError } from "../lib/errors.js";
import { analyzeProject } from "../lib/architecture.js";
import { envelope, printJson } from "../lib/json.js";
import { loadState } from "../lib/state.js";
import type { GlobalOptions } from "./types.js";
import { getGlobalEnvKeys } from "../lib/env-manifest.js";

async function fixTurboEnv(
  cwd: string,
  logger: GlobalOptions["logger"],
): Promise<{ fixed: boolean; message: string }> {
  const turboPath = join(cwd, "turbo.json");
  if (!existsSync(turboPath)) return { fixed: false, message: "turbo.json not found" };
  try {
    const raw = await readFile(turboPath, "utf-8");
    const parsed = JSON.parse(raw) as { globalEnv?: string[]; [k: string]: unknown };
    const expected = getGlobalEnvKeys("bun");
    const actual = parsed.globalEnv ?? [];
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      return { fixed: false, message: "turbo.json globalEnv already in sync" };
    }
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k as never));
    parsed.globalEnv = expected;
    await writeFile(turboPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    logger.info(`Fixed turbo.json globalEnv: ${missing.length} added, ${extra.length} removed`);
    return { fixed: true, message: `turbo.json globalEnv fixed (${missing.length} added)` };
  } catch (err) {
    return {
      fixed: false,
      message: `Failed to fix turbo.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function checkCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();

  const state = await loadState(options.cwd);
  if (!state) {
    throw new ProjectStateError("No GhostInit project found in the current directory", {
      cwd: options.cwd,
    });
  }

  const wantsFix = Boolean(options.fix);
  const fixed: string[] = [];
  const fixMessages: string[] = [];

  if (wantsFix) {
    const turboFix = await fixTurboEnv(options.cwd, options.logger);
    if (turboFix.fixed) {
      fixed.push("turbo.json");
      fixMessages.push(turboFix.message);
    } else if (
      turboFix.message !== "turbo.json globalEnv already in sync" &&
      turboFix.message !== "turbo.json not found"
    ) {
      fixMessages.push(turboFix.message);
    }
  }

  const findings = await analyzeProject(options.cwd);
  const blockers = findings.filter((f) => f.severity === "BLOCKER").length;
  const highs = findings.filter((f) => f.severity === "HIGH").length;
  const mediums = findings.filter((f) => f.severity === "MEDIUM").length;

  const passed = blockers === 0 && highs === 0;
  const durationMs = Date.now() - start;

  if (options.json) {
    printJson(
      envelope({
        success: passed,
        exitCode: passed ? ExitCode.OK : ExitCode.GENERAL_ERROR,
        data: {
          findings,
          summary: { blockers, highs, mediums },
          fixed: wantsFix ? fixed : undefined,
          fixMessages: wantsFix ? fixMessages : undefined,
        },
        command: "check",
        durationMs,
      }),
    );
    return passed ? ExitCode.OK : ExitCode.GENERAL_ERROR;
  }

  if (wantsFix && fixed.length > 0) {
    options.logger.info(`Auto-fixed ${fixed.length} issue(s): ${fixed.join(", ")}`);
    for (const m of fixMessages) options.logger.info(m);
  } else if (wantsFix) {
    options.logger.info("No auto-fixable issues found. Remaining findings require manual fix.");
    for (const m of fixMessages) if (m) options.logger.info(m);
  }

  for (const finding of findings) {
    options.logger[finding.severity === "LOW" ? "warn" : "error"](
      `[${finding.severity}] ${finding.message} (${finding.rule})`,
      { file: finding.file },
    );
  }

  options.logger.info(
    `Check ${passed ? "passed" : "failed"} — ${findings.length} findings (${blockers} BLOCKER, ${highs} HIGH, ${mediums} MEDIUM) in ${durationMs}ms${wantsFix && fixed.length > 0 ? ` (fixed ${fixed.length})` : ""}`,
  );

  return passed ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
