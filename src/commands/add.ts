/**
 * ghostinit add implementation.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ExitCode, ValidationError, GhostinitError } from "../lib/errors.js";
import { acquireLock } from "../lib/lock.js";
import { loadState } from "../lib/state.js";
import { envelope, printJson } from "../lib/json.js";
import { generateModule } from "../generators/module.js";
import { generateUseCase } from "../generators/use-case.js";
import { generateProcedure } from "../generators/procedure.js";
import { generateAction } from "../generators/action.js";
import { syncCommand } from "./sync.js";
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

function assertValidName(name: string, context: string): void {
  const result = validateArtifactName(name, context);
  if (!result.valid) {
    throw new GhostinitError(result.reason, ExitCode.INVALID_ARGUMENTS, { name });
  }
}

export async function addCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const subcommand = args[0] as Subcommand | string;

  if (!SUBCOMMANDS.includes(subcommand as Subcommand)) {
    throw new ValidationError(`Unknown add subcommand: ${subcommand}`);
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

  const { release } = await acquireLock(options.cwd, options.logger, { force: options.force });
  let addedName = "";
  let noop = false;

  try {
    switch (subcommand) {
      case "module": {
        const name = args[1];
        assertValidName(name, "module name");
        addedName = name;
        noop = await generateModule(options.cwd, name, options);
        break;
      }
      case "use-case": {
        const moduleName = args[1];
        const useCaseName = args[2];
        assertValidName(moduleName, "module name");
        assertValidName(useCaseName, "use-case name");
        assertModuleExists(options.cwd, moduleName);
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
        const moduleName = args[1];
        const procedureName = args[2];
        assertValidName(moduleName, "module name");
        assertValidName(procedureName, "procedure name");
        assertModuleExists(options.cwd, moduleName);
        addedName = `${moduleName}/${procedureName}`;
        noop = await generateProcedure(options.cwd, moduleName, procedureName, options);
        break;
      }
      case "action": {
        const moduleName = args[1];
        const actionName = args[2];
        assertValidName(moduleName, "module name");
        assertValidName(actionName, "action name");
        assertModuleExists(options.cwd, moduleName);
        addedName = `${moduleName}/${actionName}`;
        noop = await generateAction(options.cwd, moduleName, actionName, options);
        break;
      }
    }
  } finally {
    await release();
  }

  // Keep deterministic registries in sync after any addition.
  const syncResult = await syncCommand([], { ...options, json: false });
  const updated = await loadState(options.cwd);

  if (options.json) {
    printJson(
      envelope({
        success: syncResult === ExitCode.OK,
        exitCode: syncResult,
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

  return syncResult;
}
