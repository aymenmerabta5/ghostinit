/**
 * upgrade command — bring an existing ghostinit project up to date with the
 * installed CLI.
 *
 * What it actually does (and reports honestly):
 * 1. Rebuilds the four deterministic registries (modules/contract/router/schema).
 * 2. Repairs turbo.json globalEnv against the env manifest SSOT.
 * 3. Stamps .ghostinit/state.json generatedBy with the current CLI version.
 *
 * It does NOT re-render templates: files you have generated keep their content.
 * For template changes between CLI releases, regenerate into a fresh directory
 * and diff, or apply the template updates by hand.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ExitCode } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { loadState } from "../lib/state.js";
import { ghostinitVersion } from "../templates/versions.js";
import { fixTurboEnv } from "./check.js";
import type { GlobalOptions } from "./types.js";

export async function upgradeCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const cwd = resolve(options.cwd ?? process.cwd());

  const state = await loadState(cwd);
  const hasPackageJson = existsSync(join(cwd, "package.json"));
  if (!state && !hasPackageJson) {
    options.logger.warn(`No project found in ${cwd}.`);
    return ExitCode.INVALID_STATE;
  }
  if (!state) {
    options.logger.warn(
      `Found a package.json but no .ghostinit/state.json in ${cwd}. Run \`ghostinit init\` or regenerate with \`ghostinit create\` first.`,
    );
    return ExitCode.INVALID_STATE;
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
