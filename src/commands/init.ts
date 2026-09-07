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
import { ExitCode, ConflictError } from "../lib/errors.js";
import { projectConfigSchema } from "../lib/config.js";
import { envelope, printJson } from "../lib/json.js";
import { PROJECT_NAME_RE } from "../lib/interactive.js";
import { runProjectInstall } from "./create/installer.js";
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
  const start = Date.now();
  const cwd = resolve(options.cwd ?? process.cwd());

  let name = args[0];
  if (!name) {
    const derived = basename(cwd);
    name = PROJECT_NAME_RE.test(derived) ? derived : "my-app";
  }
  if (!PROJECT_NAME_RE.test(name)) {
    throw new ConflictError(
      `Invalid project name "${name}": must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens`,
    );
  }

  // Guard BEFORE generating: any real content (not just package.json) requires --force.
  if (!options.force && hasExistingContent(cwd)) {
    throw new ConflictError(
      `Directory ${cwd} is not empty. Use --force to initialize anyway (existing files may be overwritten).`,
    );
  }

  const config = projectConfigSchema.parse({
    name,
    runtime: options.runtime ?? "bun",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    mode: options.mode ?? "monorepo",
    framework: options.framework ?? "nextjs",
    billing: options.billing ?? [],
    features: (options.features ?? []).filter((f) => f !== "eve" && f !== "i18n"),
    database: options.database ?? "postgres",
    apps: options.apps ?? ["web"],
    preset: options.preset ?? "saas",
    cache: options.cache ?? "none",
    deploy: options.deploy ?? "none",
    auth: options.preset === "frontend" ? false : undefined,
    api: options.preset === "frontend" ? false : undefined,
    email: options.preset === "frontend" ? false : undefined,
    analytics: options.preset === "frontend" ? false : undefined,
    eve: options.withEve === true || (options.features ?? []).includes("eve" as never),
    i18n: options.withI18n === true || (options.features ?? []).includes("i18n" as never),
    pdf: options.withPdf === true,
    messaging: options.withMessaging === true,
  });

  const { filesWritten, installFailed, isDryRun } = await runProjectInstall({
    projectName: name,
    projectRoot: cwd,
    config,
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
        },
        command: "init",
        durationMs: Date.now() - start,
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
