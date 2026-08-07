/**
 * upgrade command — bump version and re-sync.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ExitCode } from "../lib/errors.js";
import type { GlobalOptions } from "./types.js";

export async function upgradeCommand(args: string[], options: GlobalOptions): Promise<number> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const isProject =
    existsSync(resolve(cwd, ".ghostinit/state.json")) || existsSync(resolve(cwd, "package.json"));

  if (!isProject) {
    options.logger.warn(`No project found in ${cwd}.`);
    return ExitCode.INVALID_STATE;
  }

  try {
    const { syncCommand } = await import("./sync.js");
    const syncResult = await syncCommand([], options);
    if (syncResult !== ExitCode.OK) return syncResult;

    options.logger.info("Project upgraded: registries rebuilt.");

    try {
      const pkgPath = resolve(cwd, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const projVersion = pkg.dependencies?.["ghostinit"] ?? pkg.devDependencies?.["ghostinit"];
        if (projVersion) options.logger.info(`Project ghostinit dependency: ${projVersion}`);
      }
    } catch {}

    if (options.json) {
      const { envelope, printJson } = await import("../lib/json.js");
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: { upgraded: true, cwd },
          command: "upgrade",
          durationMs: 0,
        }),
      );
    }

    return ExitCode.OK;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    options.logger.error(`Upgrade failed: ${msg}`);
    return ExitCode.GENERAL_ERROR;
  }
}
