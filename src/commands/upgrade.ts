/** Hash-gated V1 -> V2 and desired-state upgrade command. */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ExitCode,
  ConflictError,
  ProjectStateError,
  GhostinitError,
  exitCodeName,
} from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { acquireLock } from "../lib/lock.js";
import { applyReconcilePlan, buildReconcilePlan, publicReconcilePlan } from "../lib/reconcile.js";
import { loadState } from "../lib/state.js";
import { loadDesiredProjectConfig } from "../lib/project-config.js";
import { runDependencySecurity } from "../lib/dependency-security/runtime.js";
import {
  InstallerProcessTreeError,
  InstallerContainmentUnavailableError,
  InstallerInterruptedError,
} from "../lib/process-supervisor.js";
import { dependencySecurityPolicy } from "../templates/tooling/dependency-security-policy.js";
import { publicDependencySecurityResult } from "../domain/dependency-security/public-result.js";
import type { DependencySecurityResult } from "../domain/dependency-security/types.js";
import { ghostinitVersion } from "../templates/versions.js";
import type { GlobalOptions } from "./types.js";
import { upgradeRequiresLockReconciliation } from "./upgrade-lock.js";

export async function upgradeCommand(
  _args: string[],
  options: GlobalOptions,
  dependencies: { runSecurity?: typeof runDependencySecurity } = {},
): Promise<number> {
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
            dependencySecurity: { status: "not-run", reason: "dry-run" },
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
  let releaseLock = true;
  try {
    const state = await loadState(cwd);
    if (!state) throw new ProjectStateError("Project state disappeared after lock acquisition");
    const plan = await buildReconcilePlan(cwd, state, { operation: "upgrade" });
    if (plan.conflicts.length > 0) {
      throw new ConflictError("Managed-file conflicts prevent upgrade", {
        plan: publicReconcilePlan(plan),
      });
    }
    const reconcileLock =
      !options.noInstall && (await upgradeRequiresLockReconciliation(cwd, plan));
    await applyReconcilePlan(cwd, state, plan, "upgrade");
    let security: DependencySecurityResult | null = null;
    let securityError: unknown;
    if (!options.noInstall) {
      try {
        const { resolved } = await loadDesiredProjectConfig(cwd);
        security = await (dependencies.runSecurity ?? runDependencySecurity)({
          cwd,
          mode: "install",
          reconcileLock,
          bootstrap:
            !existsSync(join(cwd, "bun.lock")) ||
            !existsSync(join(cwd, "dependency-lock-evidence.json")),
          policy: dependencySecurityPolicy(
            resolved.apps.some((app) => app.target === "expo"),
            resolved.apps.some((app) => app.target === "nextjs" && app.deploy === "cloudflare"),
          ),
          logger: options.logger,
          leaseOwner: lock.owner,
          verifyProject: true,
        });
      } catch (error) {
        securityError = error;
        if (
          error instanceof InstallerProcessTreeError &&
          !(error instanceof InstallerContainmentUnavailableError)
        ) {
          releaseLock = false;
        }
      }
    }
    const failureMessage =
      securityError === undefined
        ? security?.message
        : securityError instanceof Error
          ? securityError.message
          : String(securityError);
    const code =
      securityError !== undefined
        ? securityError instanceof InstallerInterruptedError
          ? ExitCode.CANCELLED
          : securityError instanceof GhostinitError
            ? securityError.code
            : ExitCode.GENERAL_ERROR
        : security?.status === "blocked"
          ? ExitCode.DRIFT
          : security && (security.status === "failed" || !security.installedVerified)
            ? ExitCode.GENERAL_ERROR
            : ExitCode.OK;
    const success = code === ExitCode.OK;

    if (options.json) {
      printJson(
        envelope({
          success,
          exitCode: code,
          data: {
            upgraded: true,
            dryRun: false,
            cwd,
            sourceStateVersion: state.sourceVersion,
            targetStateVersion: 2,
            currentVersion: ghostinitVersion,
            recoveredOperation: state.pendingOperation?.id ?? null,
            plan: publicReconcilePlan(plan),
            dependencySecurity:
              securityError !== undefined
                ? {
                    status: "failed",
                    installedVerified: false,
                    outcomeUnknown: true,
                    recoveryRequired: true,
                    message: failureMessage,
                  }
                : security
                  ? publicDependencySecurityResult(security)
                  : { status: "not-run", reason: "no-install" },
          },
          error: success
            ? undefined
            : {
                message:
                  "Project files were upgraded; dependency security verification did not complete. " +
                  (failureMessage ?? "Inspect the project before continuing."),
                code: exitCodeName(code),
              },
          command: "upgrade",
          durationMs: Date.now() - start,
        }),
      );
    } else {
      if (!success)
        options.logger.warn(
          "Project files were upgraded; dependency security verification needs attention. " +
            (failureMessage ?? ""),
        );
      else if (options.noInstall)
        options.logger.info(
          "Project files upgraded; dependency installation was explicitly skipped.",
        );
      else options.logger.info("Project upgraded and dependency security verified.");
      if (security?.status === "partial")
        options.logger.warn(
          security.message ?? "Lower-severity dependency findings still require review.",
        );
    }
    return code;
  } finally {
    if (releaseLock) await lock.release();
  }
}
