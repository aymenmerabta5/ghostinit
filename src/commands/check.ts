/**
 * ghostinit check implementation.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { ExitCode, ProjectStateError } from "../lib/errors.js";
import { analyzeProject } from "../lib/architecture.js";
import { envelope, printJson } from "../lib/json.js";
import { loadState } from "../lib/state.js";
import type { GlobalOptions } from "./types.js";
import { getGlobalEnvKeys } from "../lib/env-manifest.js";
import { FsTransaction } from "../lib/fs.js";
import { acquireLock } from "../lib/lock.js";

export async function fixTurboEnv(
  cwd: string,
  logger: GlobalOptions["logger"],
  options: { dryRun?: boolean } = {},
): Promise<{ fixed: boolean; wouldFix: boolean; message: string }> {
  const turboPath = join(cwd, "turbo.json");
  if (!existsSync(turboPath))
    return { fixed: false, wouldFix: false, message: "turbo.json not found" };
  try {
    const raw = await readFile(turboPath, "utf-8");
    const parsed = JSON.parse(raw) as { globalEnv?: string[]; [k: string]: unknown };
    const expected = getGlobalEnvKeys("bun");
    const actual = parsed.globalEnv ?? [];
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      return { fixed: false, wouldFix: false, message: "turbo.json globalEnv already in sync" };
    }
    const missing = expected.filter((k) => !actual.includes(k));
    const extra = actual.filter((k) => !expected.includes(k as never));
    parsed.globalEnv = expected;
    if (options.dryRun) {
      return {
        fixed: false,
        wouldFix: true,
        message: `Would fix turbo.json globalEnv (${missing.length} added, ${extra.length} removed)`,
      };
    }
    const tx = new FsTransaction(cwd);
    await tx.write("turbo.json", `${JSON.stringify(parsed, null, 2)}\n`);
    await tx.commit();
    logger.info(`Fixed turbo.json globalEnv: ${missing.length} added, ${extra.length} removed`);
    return {
      fixed: true,
      wouldFix: true,
      message: `turbo.json globalEnv fixed (${missing.length} added)`,
    };
  } catch (err) {
    return {
      fixed: false,
      wouldFix: false,
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
  const wouldFix: string[] = [];
  const fixMessages: string[] = [];

  if (wantsFix) {
    const lock = options.dryRun
      ? undefined
      : await acquireLock(options.cwd, options.logger, { force: options.force });
    try {
      const turboFix = await fixTurboEnv(options.cwd, options.logger, {
        dryRun: options.dryRun,
      });
      if (turboFix.fixed) {
        fixed.push("turbo.json");
        fixMessages.push(turboFix.message);
      } else if (turboFix.wouldFix) {
        wouldFix.push("turbo.json");
        fixMessages.push(turboFix.message);
      } else if (
        turboFix.message !== "turbo.json globalEnv already in sync" &&
        turboFix.message !== "turbo.json not found"
      ) {
        fixMessages.push(turboFix.message);
      }
    } finally {
      await lock?.release();
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
          wouldFix: wantsFix && options.dryRun ? wouldFix : undefined,
          fixMessages: wantsFix ? fixMessages : undefined,
        },
        error: passed
          ? undefined
          : {
              message: `Architecture check failed with ${blockers} blocker(s) and ${highs} high-severity finding(s)`,
              code: "GENERAL_ERROR",
              details: { blockers, highs, mediums },
            },
        command: "check",
        durationMs,
      }),
    );
    return passed ? ExitCode.OK : ExitCode.GENERAL_ERROR;
  }

  if (wantsFix && options.dryRun && wouldFix.length > 0) {
    options.logger.info(`[dry-run] Would auto-fix: ${wouldFix.join(", ")}`);
    for (const m of fixMessages) options.logger.info(m);
  } else if (wantsFix && fixed.length > 0) {
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
