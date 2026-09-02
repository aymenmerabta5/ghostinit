// @allow-long 425: validation, generator dispatch, and one-lock transaction reporting form one CLI command
/**
 * ghostinit add implementation — with empty-args guard, pre-lock validation, and noop-aware sync.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ExitCode, ValidationError, GhostinitError, exitCodeName } from "../lib/errors.js";
import { acquireLock } from "../lib/lock.js";
import { loadState, stageState } from "../lib/state.js";
import { relativeChecksum } from "../lib/checksum.js";
import { FsRollbackError, FsTransaction } from "../lib/fs.js";
import { envelope, printJson } from "../lib/json.js";
import { generateModule } from "../generators/module.js";
import { generateUseCase } from "../generators/use-case.js";
import { generateProcedure } from "../generators/procedure.js";
import { generateAction } from "../generators/action.js";
// `rebuildRegistries` is dynamically imported inside the locked region so sync.ts
// and add.ts never both hold the lock at once; syncCommand remains the CLI
// entry point that owns its own lock. See the fix comment in the body.
import { validateArtifactName } from "../lib/reserved.js";
import { checkGitStatus, assertCleanGit } from "../lib/git.js";
import { validateProjectForMutation } from "../lib/validate-project.js";
import { createAddManagedFileState } from "../generators/shared.js";
import type { GlobalOptions } from "./types.js";

function assertModuleExists(cwd: string, moduleName: string, mode: "monorepo" | "single"): void {
  const moduleDir = join(
    cwd,
    ...(mode === "single" ? ["src", "server", "modules"] : ["packages", "modules", "src"]),
    moduleName,
  );
  if (!existsSync(moduleDir)) {
    throw new ValidationError(
      `Module "${moduleName}" does not exist. Create it first with: ghostinit add module ${moduleName}`,
    );
  }
}

const SUBCOMMANDS = ["module", "use-case", "procedure", "action"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string): value is Subcommand {
  return (SUBCOMMANDS as readonly string[]).includes(value);
}

function assertValidName(name: string | undefined, context: string): asserts name is string {
  if (!name) {
    throw new ValidationError(`${context}: name is required`);
  }
  const result = validateArtifactName(name, context);
  if (!result.valid) {
    // Always use ValidationError for invalid names (including reserved) for consistent exit code mapping.
    throw new ValidationError(result.reason, { name });
  }
}

function showAddUsage(): string {
  return `Usage:
  ghostinit add module <name>
  ghostinit add use-case <module> <name> --kind command|query
  ghostinit add procedure <module> <name>
  ghostinit add action <module> <name>`;
}

export interface AddCommandDependencies {
  stageState?: typeof stageState;
  rebuildRegistries?: typeof import("./sync.js").rebuildRegistries;
  createTransaction?: (root: string) => FsTransaction;
}

export async function addCommand(
  args: string[],
  options: GlobalOptions,
  dependencies: AddCommandDependencies = {},
): Promise<number> {
  const start = Date.now();

  // --list / list subcommand: list existing modules without mutation
  const wantsList = Boolean(options.list) || args[0] === "list" || args[0] === "--list";
  if (wantsList) {
    const state = await loadState(options.cwd);
    const rawModules: string[] = state?.modules ?? [];
    // Also scan FS for modules that exist but not yet in state (e.g., before sync)
    let fsModules: string[] = [];
    try {
      const { readdir } = await import("node:fs/promises");
      const { join: joinPath } = await import("node:path");
      const { existsSync: existsSyncFs } = await import("node:fs");
      const modulesDir = joinPath(
        options.cwd,
        ...(state?.project.mode === "single"
          ? ["src", "server", "modules"]
          : ["packages", "modules", "src"]),
      );
      if (existsSyncFs(modulesDir)) {
        const entries = await readdir(modulesDir, { withFileTypes: true });
        fsModules = entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
      }
    } catch {}
    const modules = [...new Set([...rawModules, ...fsModules])].sort();
    const procedures = state?.procedures ?? [];
    if (options.json) {
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: { modules, procedures, count: modules.length },
          command: "add",
          durationMs: Date.now() - start,
        }),
      );
    } else {
      if (modules.length === 0) {
        options.logger.info("No modules found. Create one with: ghostinit add module <name>");
      } else {
        options.logger.info(`Modules (${modules.length}): ${modules.join(", ")}`);
        if (procedures.length > 0)
          options.logger.info(`Procedures (${procedures.length}): ${procedures.join(", ")}`);
      }
      options.logger.info(`Available subcommands: ${SUBCOMMANDS.join(", ")}`);
    }
    return ExitCode.OK;
  }

  const rawSubcommand = args[0];
  if (!rawSubcommand) {
    const message = `Missing add subcommand. ${showAddUsage()}`;
    options.logger.error(message);
    if (options.json) {
      printJson(
        envelope({
          success: false,
          exitCode: ExitCode.INVALID_ARGUMENTS,
          error: { message, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
          command: "add",
          durationMs: Date.now() - start,
        }),
      );
    }
    return ExitCode.INVALID_ARGUMENTS;
  }

  if (!isSubcommand(rawSubcommand)) {
    throw new ValidationError(
      `Unknown add subcommand: ${rawSubcommand}. Expected one of: ${SUBCOMMANDS.join(", ")}`,
    );
  }

  const subcommand = rawSubcommand;

  // --- Pre-lock validation: check args presence and names before acquiring lock ---
  // This avoids holding the lock during fast-path validation failures.
  switch (subcommand) {
    case "module": {
      assertValidName(args[1], "module name");
      break;
    }
    case "use-case": {
      assertValidName(args[1], "module name");
      assertValidName(args[2], "use-case name");
      break;
    }
    case "procedure": {
      assertValidName(args[1], "module name");
      assertValidName(args[2], "procedure name");
      break;
    }
    case "action": {
      assertValidName(args[1], "module name");
      assertValidName(args[2], "action name");
      break;
    }
  }

  const validation = await validateProjectForMutation(options.cwd);
  const projectState = await (async () => {
    if (validation.valid) return validation.state;
    if (options.force && validation.details?.drift) {
      const forced = await loadState(options.cwd);
      if (forced) {
        options.logger.warn("Drift detected; --force will reconcile generated registries.");
        return forced;
      }
    }
    throw new GhostinitError(validation.message, ExitCode.INVALID_STATE, {
      ...validation.details,
      cause: validation.error?.message,
    });
  })();

  if (!options.force && !options.dryRun) {
    const gitStatus = await checkGitStatus(options.cwd, options.logger);
    assertCleanGit(gitStatus, options.force, options.logger);
  }

  // Validate module existence pre-lock where applicable (fast IO, no lock needed)
  if (subcommand !== "module") {
    const moduleName = args[1] as string;
    if (moduleName) {
      assertModuleExists(options.cwd, moduleName, projectState.project.mode);
    }
  }

  const lock = options.dryRun
    ? undefined
    : await acquireLock(options.cwd, options.logger, { force: options.force });
  let addedName = "";
  let noop = false;
  let syncExitCode: number = ExitCode.OK;

  try {
    let mutationState = projectState;
    if (!options.dryRun) {
      // Validation before locking keeps common argument failures cheap. Repeat
      // it after locking so the state used for staging cannot be swapped in the
      // validation/acquire gap by another GhostInit process.
      const lockedValidation = await validateProjectForMutation(options.cwd);
      if (!lockedValidation.valid) {
        if (options.force && lockedValidation.details?.drift) {
          const forced = await loadState(options.cwd);
          if (forced) {
            mutationState = forced;
          } else {
            throw new GhostinitError("No GhostInit project state found", ExitCode.INVALID_STATE);
          }
        } else {
          throw new GhostinitError(lockedValidation.message, ExitCode.INVALID_STATE, {
            ...lockedValidation.details,
            cause: lockedValidation.error?.message,
          });
        }
      } else {
        mutationState = lockedValidation.state;
      }
    }

    // TOCTOU fix: re-check module existence post-lock (state may have changed between pre-lock check and lock acquisition).
    if (subcommand !== "module") {
      const moduleName = args[1] as string;
      if (moduleName) {
        assertModuleExists(options.cwd, moduleName, mutationState.project.mode);
      }
    }

    const transaction = options.dryRun
      ? new FsTransaction(options.cwd)
      : (dependencies.createTransaction ?? ((root) => new FsTransaction(root)))(options.cwd);
    const execution = {
      transaction,
      state: mutationState,
      deferCommit: true,
    } as const;

    switch (subcommand) {
      case "module": {
        const name = args[1] as string;
        addedName = name;
        noop = await generateModule(options.cwd, name, options, execution);
        break;
      }
      case "use-case": {
        const moduleName = args[1] as string;
        const useCaseName = args[2] as string;
        addedName = `${moduleName}/${useCaseName}`;
        noop = await generateUseCase(
          options.cwd,
          moduleName,
          useCaseName,
          options.kind ?? "command",
          options,
          execution,
        );
        break;
      }
      case "procedure": {
        const moduleName = args[1] as string;
        const procedureName = args[2] as string;
        addedName = `${moduleName}/${procedureName}`;
        noop = await generateProcedure(options.cwd, moduleName, procedureName, options, execution);
        break;
      }
      case "action": {
        const moduleName = args[1] as string;
        const actionName = args[2] as string;
        addedName = `${moduleName}/${actionName}`;
        noop = await generateAction(options.cwd, moduleName, actionName, options, execution);
        break;
      }
    }

    if (noop) {
      options.logger.info(
        `No changes for ${subcommand} ${addedName} (already exists), skipping sync`,
      );
      if (options.json) {
        const updated = await loadState(options.cwd);
        printJson(
          envelope({
            success: true,
            exitCode: ExitCode.OK,
            data: {
              added: subcommand,
              name: addedName,
              noop: true,
              modules: updated?.modules ?? [],
              procedures: updated?.procedures ?? [],
            },
            command: "add",
            durationMs: Date.now() - start,
          }),
        );
      }
      return ExitCode.OK;
    }

    if (options.dryRun) {
      options.logger.info(`[dry-run] Would add ${subcommand} ${addedName}`);
      if (options.json) {
        printJson(
          envelope({
            success: true,
            exitCode: ExitCode.OK,
            data: {
              added: subcommand,
              name: addedName,
              noop: false,
              dryRun: true,
              modules: projectState.modules,
              procedures: projectState.procedures,
            },
            command: "add",
            durationMs: Date.now() - start,
          }),
        );
      }
      return ExitCode.OK;
    }

    // One lock for both the module write above and the registry rebuild below.
    // This is the fix for the reported lock gap: previously `add` released its
    // lock in a finally before invoking syncCommand, which re-acquired.
    // During that gap the module existed but its registrations in the four
    // deterministic barrels (modules/index, contract, router, schema/index) did
    // not — an observer would see a half-wired project.
    //
    // `force:true` is intentionally passed only to the inner rebuild: `add`
    // already ran assertCleanGit against the tree as the user left it, and the
    // new module has deliberately dirtied the tree *because of us* — a second
    // git-clean check inside the rebuild would exit 20 on every first `add` in a
    // git-tracked repo, leaving the module written but never wired.
    let commitAttempted = false;
    try {
      const rebuildRegistries =
        dependencies.rebuildRegistries ?? (await import("./sync.js")).rebuildRegistries;
      const rebuilt = await rebuildRegistries(
        { ...options, json: false, force: true, cwd: options.cwd },
        start,
        { state: mutationState, transaction, deferCommit: true },
      );
      syncExitCode = rebuilt.exitCode;
      if (syncExitCode !== ExitCode.OK) {
        await transaction.rollback();
      } else {
        const staged = transaction.getStagedFiles();
        const checksums = staged.map(({ path, content }) =>
          relativeChecksum(options.cwd, path, content),
        );
        const managedFiles = staged.map(({ path, content }) =>
          createAddManagedFileState(mutationState, path, content),
        );
        await (dependencies.stageState ?? stageState)(
          transaction,
          options.cwd,
          mutationState.project,
          checksums,
          rebuilt.modules,
          rebuilt.procedures,
          { managedFiles, existingState: mutationState },
        );
        commitAttempted = true;
        await transaction.commit();
      }
    } catch (error) {
      if (error instanceof FsRollbackError) throw error;
      // Clear a failed pre-commit composition. Once commit is attempted, the
      // transaction owns exact-byte compensation for every artifact, registry,
      // and state write in that same batch.
      if (!commitAttempted && transaction.stagedPaths.length > 0) await transaction.rollback();
      throw error;
    }
  } finally {
    await lock?.release();
  }

  const updated = await loadState(options.cwd);
  if (options.json) {
    printJson(
      envelope({
        success: syncExitCode === ExitCode.OK,
        exitCode: syncExitCode,
        data: {
          added: subcommand,
          name: addedName,
          noop,
          modules: updated?.modules ?? [],
          procedures: updated?.procedures ?? [],
        },
        error:
          syncExitCode === ExitCode.OK
            ? undefined
            : {
                message: "Add transaction was rolled back because registry synchronization failed",
                code: exitCodeName(syncExitCode),
              },
        command: "add",
        durationMs: Date.now() - start,
      }),
    );
  }
  return syncExitCode;
}
