/**
 * ghostinit doctor implementation.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ExitCode } from "../lib/errors.js";
import { envelope, printJson } from "../lib/json.js";
import { loadState } from "../lib/state.js";
import { ghostinitVersion } from "../templates/versions.js";
import type { GlobalOptions } from "./types.js";

interface Check {
  name: string;
  ok: boolean;
  message: string;
  meta?: Record<string, unknown>;
}

function runCommand(cmd: string, args: string[]): Promise<{ ok: boolean; version: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    let stdout = "";
    child.stdout.on("data", (data) => {
      stdout += String(data);
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, version: stdout.split("\n")[0].trim() });
    });
  });
}

async function loadEnvMap(root: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  for (const fileName of [".env", ".env.local", ".env.production", ".env.development"]) {
    try {
      const raw = await readFile(join(root, fileName), "utf-8");
      for (const line of raw.split("\n")) {
        const idx = line.indexOf("=");
        if (idx <= 0 || line.startsWith("#")) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        vars[key] = value;
      }
    } catch {
      // File missing; continue.
    }
  }
  // Runtime environment values take precedence over placeholder files.
  for (const key of [
    "BETTER_AUTH_SECRET",
    "DATABASE_URL",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "POSTGRES_PASSWORD",
  ]) {
    const envValue = process.env[key];
    if (envValue !== undefined) {
      vars[key] = envValue;
    }
  }
  return vars;
}

function checkSecretStrength(name: string, value?: string): Check {
  if (!value || value.length < 32) {
    return {
      name: "secret-strength",
      ok: false,
      message: `${name} is missing or too short`,
    };
  }
  return {
    name: "secret-strength",
    ok: true,
    message: `${name} length looks strong enough`,
  };
}

async function checkDatabase(vars: Record<string, string>): Promise<Check> {
  const url = vars.DATABASE_URL;
  if (!url) return { name: "database-url", ok: false, message: "DATABASE_URL not set" };
  try {
    new URL(url);
    return { name: "database-url", ok: true, message: "DATABASE_URL looks valid" };
  } catch {
    return { name: "database-url", ok: false, message: "DATABASE_URL is not a valid URL" };
  }
}

function checkPresence(name: string, present: boolean): Check {
  return {
    name: name.toLowerCase(),
    ok: present,
    message: present ? `${name} is set` : `${name} not set`,
  };
}

export async function doctorCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const checks: Check[] = [];

  const bun = await runCommand("bun", ["--version"]);
  checks.push({
    name: "bun",
    ok: bun.ok,
    message: bun.ok ? `Bun ${bun.version}` : "Bun not found",
  });

  const node = await runCommand("node", ["--version"]);
  checks.push({
    name: "node",
    ok: node.ok,
    message: node.ok ? `Node ${node.version}` : "Node not found",
  });

  const tsc = await runCommand("bunx", ["tsc", "--version"]);
  checks.push({
    name: "typescript",
    ok: tsc.ok,
    message: tsc.ok ? `TypeScript ${tsc.version}` : "TypeScript not found",
  });

  checks.push({ name: "ghostinit-version", ok: true, message: `ghostinit ${ghostinitVersion}` });

  const state = await loadState(options.cwd);
  const envVars = await loadEnvMap(options.cwd);

  const authSecret = envVars.BETTER_AUTH_SECRET;
  const betterAuthUrl = envVars.BETTER_AUTH_URL;
  const appUrl = envVars.NEXT_PUBLIC_APP_URL;
  const postgresPassword = envVars.POSTGRES_PASSWORD;

  if (state) {
    checks.push({
      name: "ghostinit-state",
      ok: true,
      message: `Project state found for ${state.project.name}`,
    });
    checks.push(checkSecretStrength("BETTER_AUTH_SECRET", authSecret));
    checks.push(await checkDatabase(envVars));
    checks.push(checkPresence("BETTER_AUTH_URL", typeof betterAuthUrl === "string"));
    checks.push(checkPresence("NEXT_PUBLIC_APP_URL", typeof appUrl === "string"));
    checks.push(checkPresence("POSTGRES_PASSWORD", typeof postgresPassword === "string"));
  } else {
    checks.push({
      name: "ghostinit-state",
      ok: false,
      message: "No GhostInit project state found",
    });
  }

  const allOk = checks.every((c) => c.ok);

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
      );
    }
  }

  return allOk ? ExitCode.OK : ExitCode.GENERAL_ERROR;
}
