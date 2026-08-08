import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ExitCode } from "../../lib/errors.js";
import { envelope, printJson } from "../../lib/json.js";
import { loadState } from "../../lib/state.js";
import { ghostinitVersion } from "../../templates/versions.js";
import type { GlobalOptions } from "../types.js";
import { loadEnvMap } from "./env.js";
import { collectToolVersions } from "./versions.js";
import { getGlobalEnvKeys } from "../../lib/env-manifest.js";
import {
  checkDatabase,
  checkDatabaseConnectivity,
  checkPresence,
  checkSecretStrength,
  type Check,
} from "./checks.js";

function mintSecret(): string {
  return randomBytes(48).toString("base64url");
}

async function fixEnvSecrets(
  cwd: string,
  _logger: GlobalOptions["logger"],
): Promise<{ fixed: string[]; messages: string[] }> {
  const fixed: string[] = [];
  const messages: string[] = [];
  const envLocalPath = join(cwd, ".env.local");
  const envExamplePath = join(cwd, ".env.example");

  // Ensure .env.local exists — if missing create it from .env.example or minimal
  if (!existsSync(envLocalPath) && existsSync(envExamplePath)) {
    try {
      const example = await readFile(envExamplePath, "utf-8");
      await writeFile(envLocalPath, example, "utf-8");
      fixed.push(".env.local");
      messages.push("Created .env.local from .env.example");
    } catch (err) {
      messages.push(
        `Failed to create .env.local: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!existsSync(envLocalPath)) return { fixed, messages };

  try {
    let content = await readFile(envLocalPath, "utf-8");
    let changed = false;
    const replacements: Array<[RegExp, string, string]> = [
      [/REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS/g, mintSecret(), "BETTER_AUTH_SECRET"],
      [/REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD/g, mintSecret(), "POSTGRES_PASSWORD"],
      [/REPLACE_WITH_BETTER_AUTH_SECRET/g, mintSecret(), "BETTER_AUTH_SECRET"],
    ];
    for (const [pattern, replacement, label] of replacements) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        if (!fixed.includes(label)) fixed.push(label);
        messages.push(`Minted ${label}`);
        changed = true;
      }
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
    }
    // Also fix bare empty values: BETTER_AUTH_SECRET=  or POSTGRES_PASSWORD=
    const emptySecretLines = content.split("\n");
    let emptyFixed = false;
    const updatedLines = emptySecretLines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("BETTER_AUTH_SECRET=") && trimmed.split("=")[1].trim().length < 32) {
        const val = trimmed.split("=")[1].trim();
        if (val.length === 0 || val.startsWith("REPLACE_WITH")) {
          emptyFixed = true;
          return `BETTER_AUTH_SECRET=${mintSecret()}`;
        }
      }
      if (trimmed.startsWith("POSTGRES_PASSWORD=") && trimmed.split("=")[1].trim().length < 8) {
        const val = trimmed.split("=")[1].trim();
        if (val.length === 0 || val.startsWith("REPLACE_WITH")) {
          emptyFixed = true;
          return `POSTGRES_PASSWORD=${mintSecret()}`;
        }
      }
      return line;
    });
    if (emptyFixed) {
      content = updatedLines.join("\n");
      changed = true;
      if (!fixed.includes("empty-secret")) fixed.push("BETTER_AUTH_SECRET/POSTGRES_PASSWORD");
      messages.push("Fixed empty secret values");
    }

    if (changed) {
      await writeFile(envLocalPath, content, "utf-8");
    }
  } catch (err) {
    messages.push(`Failed to fix env secrets: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { fixed, messages };
}

async function fixTurboEnvDoctor(
  cwd: string,
  _logger: GlobalOptions["logger"],
): Promise<{ fixed: boolean; message: string }> {
  const turboPath = join(cwd, "turbo.json");
  if (!existsSync(turboPath)) return { fixed: false, message: "" };
  try {
    const raw = await readFile(turboPath, "utf-8");
    const parsed = JSON.parse(raw) as { globalEnv?: string[]; [k: string]: unknown };
    const expected = getGlobalEnvKeys("bun");
    const actual = parsed.globalEnv ?? [];
    if (JSON.stringify(actual) === JSON.stringify(expected)) return { fixed: false, message: "" };
    parsed.globalEnv = expected;
    await writeFile(turboPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    return { fixed: true, message: `Fixed turbo.json globalEnv (${expected.length} keys)` };
  } catch (err) {
    return {
      fixed: false,
      message: `Failed to fix turbo.json: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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

  const wantsFix = Boolean(options.fix);
  const fixed: string[] = [];
  const fixMessages: string[] = [];

  if (wantsFix) {
    const envFix = await fixEnvSecrets(options.cwd, options.logger);
    if (envFix.fixed.length > 0) {
      fixed.push(...envFix.fixed);
      fixMessages.push(...envFix.messages);
    }
    const turboFix = await fixTurboEnvDoctor(options.cwd, options.logger);
    if (turboFix.fixed) {
      fixed.push("turbo.json");
      fixMessages.push(turboFix.message);
    } else if (turboFix.message) {
      fixMessages.push(turboFix.message);
    }
    // Re-load env after fix for accurate re-check
    if (fixed.length > 0) {
      const reloaded = await loadEnvMap(options.cwd);
      // Update checks that depend on env for final report
      for (let i = 0; i < checks.length; i++) {
        const c = checks[i];
        if (c.name === "secret-strength" || c.name === "postgres_password") {
          const pwLen = reloaded.POSTGRES_PASSWORD_LENGTH;
          const pwOk = pwLen !== undefined && Number.parseInt(pwLen, 10) > 0;
          if (c.name === "postgres_password") {
            checks[i] = {
              name: "postgres_password",
              ok: pwOk,
              message: pwOk ? "POSTGRES_PASSWORD is set" : "POSTGRES_PASSWORD not set",
            };
          }
        }
      }
      // Re-evaluate env-based checks
      const newSecret = checkSecretStrength(
        "BETTER_AUTH_SECRET",
        reloaded.BETTER_AUTH_SECRET_LENGTH,
      );
      const idx = checks.findIndex((c) => c.name === "secret-strength");
      if (idx !== -1) checks[idx] = newSecret;
      const dbIdx = checks.findIndex((c) => c.name === "database-url");
      if (dbIdx !== -1) {
        const newDb = await checkDatabase(reloaded);
        checks[dbIdx] = newDb;
      }
    }
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
        data: {
          checks,
          fixed: wantsFix ? fixed : undefined,
          fixMessages: wantsFix ? fixMessages : undefined,
        },
        command: "doctor",
        durationMs: Date.now() - start,
      }),
    );
  } else {
    if (wantsFix && fixed.length > 0) {
      options.logger.info(`Auto-fixed ${fixed.length} issue(s): ${fixed.join(", ")}`);
      for (const m of fixMessages) options.logger.info(m);
    } else if (wantsFix) {
      options.logger.info("No auto-fixable issues found.");
      for (const m of fixMessages) if (m) options.logger.info(m);
    }
    for (const check of checks) {
      options.logger[check.ok ? "info" : "error"](
        `[${check.ok ? "OK" : "FAIL"}] ${check.name}: ${check.message}`,
        ...(check.meta ? [{ meta: check.meta }] : []),
      );
    }
  }

  return allOk ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
