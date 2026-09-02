/**
 * init command — initialize a ghostinit project in the current directory.
 *
 * Reuses the exact create pipeline (runProjectInstall) so the result is
 * indistinguishable from `ghostinit create`: state.json written, checksums
 * tracked, lock acquired, optional install + oxfmt. Previously init wrote
 * files directly and never saved state, which left add/sync/check unable
 * to manage the project ("No GhostInit project found").
 */

import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ExitCode, ConflictError, exitCodeName } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { PROJECT_NAME_RE } from "../lib/interactive.js";
import { runProjectInstall } from "./create/installer.js";
import { resolveCreateConfig } from "./create/resolution.js";
import { validateProjectName } from "./create/validation.js";
import { publicGenerationPlan } from "../templates/default.js";
import type { GlobalOptions } from "./types.js";

/** Directories that never count as "existing content" when guarding init. */
const IGNORED_ENTRIES = new Set([".ghostinit", ".git", "node_modules"]);

function hasExistingContent(cwd: string): boolean {
  try {
    const entries = readdirSync(cwd);
    return entries.some((e) => !IGNORED_ENTRIES.has(e));
  } catch {
    return false;
  }
}

export async function initCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = options.dryRun ? null : Date.now();
  const durationMs = () => (start === null ? 0 : Date.now() - start);
  const cwd = resolve(options.cwd);

  let name = args[0];
  if (!name) {
    const derived = basename(cwd);
    name = PROJECT_NAME_RE.test(derived) ? derived : "my-app";
  }
  validateProjectName(name);

  // Guard BEFORE generating: any real content (not just package.json) requires --force.
  if (!options.dryRun && !options.force && hasExistingContent(cwd)) {
    throw new ConflictError(
      `Directory ${cwd} is not empty. Use --force to initialize anyway (existing files may be overwritten).`,
    );
  }

  const resolution = resolveCreateConfig({
    name,
    runtime: options.runtime,
    mode: options.mode ?? "monorepo",
    framework: options.framework ?? "nextjs",
    billing: options.billing ?? [],
    features: options.features ?? [],
    database: options.database ?? "postgres",
    databaseWasExplicit: Array.isArray(options.rawDatabase)
      ? options.rawDatabase.length > 0
      : !!options.rawDatabase,
    apps: options.apps ?? ["web"],
    preset: options.preset,
    cache: options.cache ?? "none",
    deploy: options.deploy ?? "none",
    withAuth: options.withAuth,
    withApi: options.withApi,
    withEmail: options.withEmail,
    withAnalytics: options.withAnalytics,
    withEve: options.withEve,
    withI18n: options.withI18n,
    withPdf: options.withPdf,
    withMessaging: options.withMessaging,
    withStorage: options.withStorage,
    withNotifications: options.withNotifications,
    featureFlags: options.featureFlags,
    withJobs: options.withJobs,
  });
  if (!resolution.ok) {
    const warning = resolution.message;
    if (options.json) {
      printJson(
        envelope({
          success: false,
          exitCode: ExitCode.INVALID_ARGUMENTS,
          error: {
            message: warning,
            code: exitCodeName(ExitCode.INVALID_ARGUMENTS),
            details: {
              reason: resolution.reason,
              unsupportedSelections: resolution.unsupportedSelections,
            },
          },
          data: {
            warning,
            incompatible: true,
            reason: resolution.reason,
            unsupportedSelections: resolution.unsupportedSelections,
          },
          command: "init",
          durationMs: durationMs(),
        }),
      );
    } else {
      options.logger.error(warning);
    }
    return ExitCode.INVALID_ARGUMENTS;
  }
  const config = resolution.config;
  const desiredConfig = resolution.desiredConfig;
  const resolvedProjectConfig = resolution.resolvedConfig;

  const { filesWritten, installFailed, isDryRun, plan } = await runProjectInstall({
    projectName: name,
    projectRoot: cwd,
    config,
    desiredConfig,
    resolvedConfig: resolvedProjectConfig,
    options,
    noInstall: options.noInstall,
  });

  if (options.json) {
    printJson(
      envelope({
        success: !installFailed,
        exitCode: installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK,
        data: {
          projectName: name,
          projectRoot: cwd,
          filesWritten,
          installFailed,
          dryRun: Boolean(isDryRun),
          resolvedConfig: config,
          resolvedProjectConfig,
          configHash: plan.projectConfigHash,
          planHash: plan.planHash,
          ...(isDryRun ? { plan: publicGenerationPlan(plan) } : {}),
        },
        error: installFailed
          ? {
              message:
                "Project files were generated, but dependency installation or formatting failed",
              code: exitCodeName(ExitCode.GENERATION_ERROR),
            }
          : undefined,
        command: "init",
        durationMs: durationMs(),
      }),
    );
  } else {
    options.logger.info(
      `Initialized ghostinit project "${name}" in ${cwd} (${filesWritten} files${isDryRun ? ", dry-run" : ""})`,
    );
    if (!options.noInstall && !isDryRun) {
      options.logger.info("Next: bun run dev");
    }
  }

  return installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK;
}
