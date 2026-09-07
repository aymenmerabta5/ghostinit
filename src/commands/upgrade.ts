/** Hash-gated V1 -> V2 and desired-state upgrade command. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ExitCode, ConflictError, ProjectStateError, exitCodeName } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { acquireLock } from "../lib/lock.js";
import { applyReconcilePlan, buildReconcilePlan, publicReconcilePlan } from "../lib/reconcile.js";
import { loadState } from "../lib/state.js";
import { ghostinitVersion } from "../templates/versions.js";
import type { GlobalOptions } from "./types.js";

export async function upgradeCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const cwd = resolve(options.cwd ?? process.cwd());
  const initial = await loadState(cwd);
  if (!initial && !existsSync(join(cwd, "package.json"))) {
    throw new ProjectStateError(`No project found in ${cwd}.`, { cwd });
  }
  if (!initial) {
    throw new ProjectStateError(
      `Found a package.json but no .ghostinit/state.json in ${cwd}. Run \`ghostinit init\` or regenerate with \`ghostinit create\` first.`,
      { cwd },
    );
  }

  if (options.dryRun) {
    const plan = await buildReconcilePlan(cwd, initial, { operation: "upgrade" });
    const hasConflicts = plan.conflicts.length > 0;
    const code = hasConflicts ? ExitCode.CONFLICT_ERROR : ExitCode.OK;
    if (options.json) {
      printJson(
        envelope({
          success: !hasConflicts,
          exitCode: code,
          data: {
            upgraded: false,
            dryRun: true,
            cwd,
            sourceStateVersion: initial.sourceVersion,
            targetStateVersion: 2,
            currentVersion: ghostinitVersion,
            plan: publicReconcilePlan(plan),
          },
          error: hasConflicts
            ? {
                message: `${plan.conflicts.length} managed-file conflict(s) prevent upgrade`,
                code: exitCodeName(code),
                details: { conflicts: plan.conflicts },
              }
            : undefined,
          command: "upgrade",
          durationMs: Date.now() - start,
        }),
      );
    } else {
      options.logger.info(
        `Upgrade preview: ${plan.creates.length} create, ${plan.moves.length} move, ${plan.rewrites.length} rewrite, ${plan.deletions.length} delete, ${plan.retired.length} preserve-and-retire, ${plan.secretOperations.length} self-issued secret materialization, ${plan.conflicts.length} conflict`,
      );
      for (const path of plan.retired) {
        options.logger.info(`Would preserve user-owned seed and retire tracking: ${path}`);
      }
      for (const conflict of plan.conflicts) {
        options.logger.warn(`Conflict ${conflict.reason}: ${conflict.path}`);
        if (conflict.suggestion) options.logger.warn(conflict.suggestion);
      }
    }
    return code;
  }

  const lock = await acquireLock(cwd, options.logger, { force: options.force });
  try {
    const state = await loadState(cwd);
    if (!state) throw new ProjectStateError("Project state disappeared after lock acquisition");
    const plan = await buildReconcilePlan(cwd, state, { operation: "upgrade" });
    if (plan.conflicts.length > 0) {
      throw new ConflictError("Managed-file conflicts prevent upgrade", {
        plan: publicReconcilePlan(plan),
      });
    }
    await applyReconcilePlan(cwd, state, plan, "upgrade");

    if (options.json) {
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: {
            upgraded: true,
            dryRun: false,
            cwd,
            sourceStateVersion: state.sourceVersion,
            targetStateVersion: 2,
            currentVersion: ghostinitVersion,
            recoveredOperation: state.pendingOperation?.id ?? null,
            plan: publicReconcilePlan(plan),
          },
          command: "upgrade",
          durationMs: Date.now() - start,
        }),
      );
    } else {
      options.logger.info("Project upgraded to desired-state/state schema v2.");
    }
    return ExitCode.OK;
  } finally {
    await lock.release();
  }

  const previousVersion = state.generatedBy;

  // 1. Registries — same locked rebuild `sync` performs.
  const { syncCommand } = await import("./sync.js");
  const syncResult = await syncCommand(args, { ...options, json: false });
  if (syncResult !== ExitCode.OK) return syncResult;

  // 2. turbo.json globalEnv repair (env manifest SSOT).
  const turboFix = await fixTurboEnv(cwd, options.logger);
  if (turboFix.fixed) options.logger.info(turboFix.message);

  // 3. Version stamp (only when it actually changes).
  let versionStamped = false;
  if (previousVersion !== ghostinitVersion) {
    const { saveState } = await import("../lib/state.js");
    await saveState(
      cwd,
      state.project,
      Object.values(state.checksums),
      state.modules,
      state.procedures,
    );
    versionStamped = true;
    options.logger.info(`Stamping generatedBy: ${previousVersion} -> ${ghostinitVersion}`);
  }

  // Surface the project's ghostinit dependency version if declared (informational).
  try {
    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const projVersion = pkg.dependencies?.["ghostinit"] ?? pkg.devDependencies?.["ghostinit"];
      if (projVersion) options.logger.info(`Project ghostinit dependency: ${projVersion}`);
    }
  } catch {}

  options.logger.info(
    "Project upgraded: registries rebuilt, turbo env verified." +
      " Note: template files are NOT re-rendered; regenerate to pick up template changes.",
  );

  if (options.json) {
    printJson(
      envelope({
        success: true,
        exitCode: ExitCode.OK,
        data: {
          upgraded: true,
          cwd,
          previousVersion,
          currentVersion: ghostinitVersion,
          versionStamped,
          turboEnvFixed: turboFix.fixed,
          templateRerender: false,
        },
        command: "upgrade",
        durationMs: Date.now() - start,
      }),
    );
  }

  return ExitCode.OK;
}
