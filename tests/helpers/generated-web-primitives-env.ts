import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvContent(content: string, source: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const [index, originalLine] of content.split(/\r?\n/).entries()) {
    const line = originalLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      throw new Error(`Malformed environment entry at ${source}:${index + 1}`);
    }
    const key = line.slice(0, equalsIndex).trim();
    if (!ENV_KEY.test(key)) {
      throw new Error(`Malformed environment key at ${source}:${index + 1}`);
    }
    let value = line.slice(equalsIndex + 1).trim();
    const first = value.at(0);
    const last = value.at(-1);
    if (first === '"' || first === "'") {
      if (value.length < 2 || last !== first) {
        throw new Error(`Unmatched quote for ${key} at ${source}:${index + 1}`);
      }
      value = value.slice(1, -1);
    } else if (last === '"' || last === "'") {
      throw new Error(`Unmatched quote for ${key} at ${source}:${index + 1}`);
    }
    if (Object.hasOwn(parsed, key) && parsed[key] !== value) {
      throw new Error(`Conflicting duplicate environment key ${key} in ${source}`);
    }
    parsed[key] = value;
  }
  return parsed;
}

function readGeneratedEnv(root: string): Record<string, string> {
  const merged: Record<string, string> = {};
  const paths = [join(root, ".env.local"), join(root, "apps", "web", ".env.local")];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const parsed = parseEnvContent(readFileSync(path, "utf8"), path);
    for (const [key, value] of Object.entries(parsed)) {
      if (Object.hasOwn(merged, key) && merged[key] !== value) {
        throw new Error(`Conflicting duplicate environment key ${key} across generated env files`);
      }
      merged[key] = value;
    }
  }
  return merged;
}

function assertRequiredEnv(env: NodeJS.ProcessEnv): void {
  for (const key of [
    "POSTGRES_PASSWORD",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "VITE_APP_URL",
  ]) {
    if (!env[key]) throw new Error(`Required generated environment key ${key} is missing`);
  }
  if ((env.BETTER_AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error("Required generated environment key BETTER_AUTH_SECRET is shorter than 32");
  }
}

export function createGeneratedProcessEnv(
  root: string,
  url: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = {
    ...baseEnv,
    ...readGeneratedEnv(root),
    NEXT_PUBLIC_APP_URL: url,
    VITE_APP_URL: url,
  };
  assertRequiredEnv(env);
  return env;
}
