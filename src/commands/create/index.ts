import { join } from "node:path";
import { existsSync } from "node:fs";
import { ExitCode, ConflictError, exitCodeName } from "../../lib/errors.js";
import { projectConfigSchema } from "../../lib/config.js";
import { envelope, printJson } from "../../lib/json.js";
import type { GlobalOptions } from "../types.js";
import { validateProjectName, isValidAddonCombo } from "./validation.js";
import { getIsInteractive, promptInteractive } from "./prompts.js";
import { runProjectInstall } from "./installer.js";
import type {
  ProjectMode,
  FrameworkName,
  DatabaseProvider,
  BillingProviderName,
  FeatureName,
  AppName,
} from "../../lib/addons.js";

export async function createCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  let name = args[0];

  let mode: ProjectMode = (options.mode ?? "monorepo") as ProjectMode;
  let framework: FrameworkName = (options.framework ?? "nextjs") as FrameworkName;
  let billing: BillingProviderName[] = (options.billing ?? []) as BillingProviderName[];
  let features: FeatureName[] = (options.features ?? []) as FeatureName[];
  let database: DatabaseProvider = (options.database ?? "postgres") as DatabaseProvider;
  let apps: AppName[] = (options.apps ?? ["web"]) as AppName[];
  let noInstall = options.noInstall;

  const interactive = getIsInteractive(options);

  if (interactive) {
    const prompted = await promptInteractive(name, {
      mode,
      framework,
      database,
      billing: billing as unknown as string[],
      features: features as unknown as string[],
      apps: apps as unknown as string[],
      noInstall,
    });
    if (prompted.cancelled) return prompted.exitCode ?? ExitCode.CANCELLED;

    name = prompted.name;
    mode = prompted.mode as unknown as ProjectMode;
    framework = prompted.framework as unknown as FrameworkName;
    database = prompted.database as unknown as DatabaseProvider;
    billing = prompted.billing as unknown as BillingProviderName[];
    features = prompted.features as unknown as FeatureName[];
    apps = prompted.apps as unknown as AppName[];
    noInstall = prompted.noInstall;
  } else {
    validateProjectName(name ?? "");
  }

  const combo = isValidAddonCombo({
    billing: billing as unknown as BillingProviderName[],
    database,
    mode,
    framework: framework as unknown as FrameworkName,
    apps: apps as unknown as AppName[],
  });
  if (!combo.valid) {
    const warning = combo.message ?? "Incompatible addon combination";
    options.logger.warn(warning);
    if (options.json) {
      printJson(
        envelope({
          success: false,
          exitCode: ExitCode.INVALID_ARGUMENTS,
          error: { message: warning, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
          data: { warning, incompatible: true, billing, database, mode, framework, features, apps },
          command: "create",
          durationMs: Date.now() - start,
        }),
      );
    } else {
      options.logger.error(
        `${warning}. Choose compatible options (e.g., add postgres for billing).`,
      );
    }
    return ExitCode.INVALID_ARGUMENTS;
  }

  const projectName = name as string;
  const projectRoot = join(options.cwd, projectName);

  const config = projectConfigSchema.parse({
    name: projectName,
    runtime: options.runtime,
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    mode,
    framework,
    billing,
    features,
    database,
    apps,
  });

  if (existsSync(projectRoot) && !options.force) {
    throw new ConflictError(`Target directory already exists: ${projectRoot}`);
  }

  const { filesWritten, installFailed } = await runProjectInstall({
    projectName,
    projectRoot,
    config,
    options,
    noInstall,
  });

  if (options.json) {
    printJson(
      envelope({
        success: !installFailed,
        exitCode: installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK,
        data: {
          projectName,
          projectRoot,
          filesWritten,
          installFailed,
          mode,
          framework,
          billing,
          features,
          database,
          apps,
        },
        command: "create",
        durationMs: Date.now() - start,
      }),
    );
  }

  return installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK;
}
