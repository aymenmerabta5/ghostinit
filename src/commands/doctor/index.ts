import { ExitCode } from "../../lib/errors.js";
import { envelope, printJson } from "../../lib/json.js";
import { loadState } from "../../lib/state.js";
import { ghostinitVersion } from "../../templates/versions.js";
import type { GlobalOptions } from "../types.js";
import { loadEnvMap } from "./env.js";
import { collectToolVersions } from "./versions.js";
import {
  checkDatabase,
  checkDatabaseConnectivity,
  checkPresence,
  checkSecretStrength,
  type Check,
} from "./checks.js";

export async function doctorCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const checks: Check[] = [];

  const { bun, node, tsc } = await collectToolVersions();

  checks.push({
    name: "bun",
    ok: bun.ok,
    message: bun.ok ? `Bun ${bun.version}` : "Bun not found",
  });
  checks.push({
    name: "node",
    ok: node.ok,
    message: node.ok ? `Node ${node.version}` : "Node not found",
  });
  checks.push({
    name: "typescript",
    ok: tsc.ok,
    message: tsc.ok ? `TypeScript ${tsc.version}` : "TypeScript not found",
  });
  checks.push({ name: "ghostinit-version", ok: true, message: `ghostinit ${ghostinitVersion}` });

  const state = await loadState(options.cwd);
  const envVars = await loadEnvMap(options.cwd);

  const betterAuthUrl = envVars.BETTER_AUTH_URL;
  const appUrl = envVars.NEXT_PUBLIC_APP_URL;

  if (state) {
    checks.push({
      name: "ghostinit-state",
      ok: true,
      message: `Project state found for ${state.project.name}`,
    });
    checks.push(checkSecretStrength("BETTER_AUTH_SECRET", envVars.BETTER_AUTH_SECRET_LENGTH));
    checks.push(await checkDatabase(envVars));
    checks.push(checkPresence("BETTER_AUTH_URL", betterAuthUrl));
    checks.push(checkPresence("NEXT_PUBLIC_APP_URL", appUrl));
    {
      const pwLengthRaw = envVars.POSTGRES_PASSWORD_LENGTH;
      const pwLengthNum = pwLengthRaw !== undefined ? Number.parseInt(pwLengthRaw, 10) : 0;
      const pwPresent = Number.isFinite(pwLengthNum) && pwLengthNum > 0;
      checks.push({
        name: "postgres_password",
        ok: pwPresent,
        message: pwPresent ? "POSTGRES_PASSWORD is set" : "POSTGRES_PASSWORD not set",
      });
    }
    const connectivity = await checkDatabaseConnectivity(envVars, options.logger);
    if (connectivity) checks.push(connectivity);
  } else {
    checks.push({
      name: "ghostinit-state",
      ok: false,
      message: "No GhostInit project state found",
    });
  }

  const requiredChecks = checks.filter((c) => {
    if (c.name === "database-connectivity") {
      const meta = c.meta as Record<string, unknown> | undefined;
      if (meta?.skipped) return false;
      if (meta?.optional) return false;
    }
    return true;
  });
  const allOk = requiredChecks.every((c) => c.ok);

  if (options.json) {
    printJson(
      envelope({
        success: allOk,
        exitCode: allOk ? ExitCode.OK : ExitCode.GENERAL_ERROR,
        data: { checks },
        command: "doctor",
        durationMs: Date.now() - start,
      }),
    );
  } else {
    for (const check of checks) {
      options.logger[check.ok ? "info" : "error"](
        `[${check.ok ? "OK" : "FAIL"}] ${check.name}: ${check.message}`,
        ...(check.meta ? [{ meta: check.meta }] : []),
      );
    }
  }

  return allOk ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
