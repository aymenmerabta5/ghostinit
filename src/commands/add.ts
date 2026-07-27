/**
 * ghostinit add implementation — with empty-args guard, pre-lock validation, and noop-aware sync.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ExitCode, ValidationError, GhostinitError, exitCodeName } from "../lib/errors.js";
import { acquireLock } from "../lib/lock.js";
import { loadState } from "../lib/state.js";
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
import type { GlobalOptions } from "./types.js";

function assertModuleExists(cwd: string, moduleName: string): void {
  const moduleDir = join(cwd, "packages", "modules", "src", moduleName);
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

export async function addCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();

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
  if (!validation.valid) {
    if (validation.exitCodeSuggestion === ExitCode.INVALID_STATE) {
      throw new GhostinitError(validation.message, ExitCode.INVALID_STATE, {
        ...validation.details,
        cause: validation.error?.message,
      });
    }
    throw new ValidationError(validation.message);
  }

  if (!options.force) {
    const gitStatus = await checkGitStatus(options.cwd, options.logger);
    assertCleanGit(gitStatus, options.force, options.logger);
  }

  // Validate module existence pre-lock where applicable (fast IO, no lock needed)
  if (subcommand !== "module") {
    const moduleName = args[1] as string;
    if (moduleName) {
      assertModuleExists(options.cwd, moduleName);
    }
  }

  const { release } = await acquireLock(options.cwd, options.logger, { force: options.force });
  let addedName = "";
  let noop = false;
  let syncExitCode: number = ExitCode.OK;

  try {
    // TOCTOU fix: re-check module existence post-lock (state may have changed between pre-lock check and lock acquisition).
    if (subcommand !== "module") {
      const moduleName = args[1] as string;
      if (moduleName) {
        assertModuleExists(options.cwd, moduleName);
      }
    }

    switch (subcommand) {
      case "module": {
        const name = args[1] as string;
        addedName = name;
        noop = await generateModule(options.cwd, name, options);
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
        );
        break;
      }
      case "procedure": {
        const moduleName = args[1] as string;
        const procedureName = args[2] as string;
        addedName = `${moduleName}/${procedureName}`;
        noop = await generateProcedure(options.cwd, moduleName, procedureName, options);
        break;
      }
      case "action": {
        const moduleName = args[1] as string;
        const actionName = args[2] as string;
        addedName = `${moduleName}/${actionName}`;
        noop = await generateAction(options.cwd, moduleName, actionName, options);
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
    const { rebuildRegistries } = await import("./sync.js");
    const rebuilt = await rebuildRegistries(
      { ...options, json: false, force: true, cwd: options.cwd },
      start,
    );
    syncExitCode = rebuilt.exitCode;
  } finally {
    await release();
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
        command: "add",
        durationMs: Date.now() - start,
      }),
    );
  }
  return syncExitCode;
}
