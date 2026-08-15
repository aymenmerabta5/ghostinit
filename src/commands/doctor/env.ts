import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SECRET_ENV_KEYS = [
  "BETTER_AUTH_SECRET",
  "POSTGRES_PASSWORD",
  "DATABASE_URL",
  "DATABASE_SSL_CA",
];

const plainSecretsCache: Record<string, string> = {};

export function clearSecretCache(): void {
  for (const k of Object.keys(plainSecretsCache)) delete plainSecretsCache[k];
}

export function getPlainSecret(key: string): string | undefined {
  return plainSecretsCache[key];
}

export function getAllPlainSecrets(): Record<string, string> {
  return { ...plainSecretsCache };
}

export function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith("#")) return undefined;
  const idx = line.indexOf("=");
  if (idx <= 0) return undefined;
  const rawKey = line.slice(0, idx).trim();
  if (!rawKey || rawKey.startsWith("#")) return undefined;
  let rawValue = line.slice(idx + 1);
  if (rawValue.endsWith("\r")) rawValue = rawValue.slice(0, -1);
  rawValue = rawValue.trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'") && rawValue.length >= 2) ||
    (rawValue.startsWith("`") && rawValue.endsWith("`") && rawValue.length >= 2)
  ) {
    rawValue = rawValue.slice(1, -1);
  } else {
    const hashIdx = rawValue.indexOf(" #");
    if (hashIdx !== -1) rawValue = rawValue.slice(0, hashIdx).trim();
  }
  return { key: rawKey, value: rawValue };
}

export async function loadEnvMap(root: string): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  clearSecretCache();
  for (const fileName of [".env", ".env.development", ".env.production", ".env.local"]) {
    try {
      const raw = await readFile(join(root, fileName), "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        const { key, value } = parsed;
        if (SECRET_ENV_KEYS.includes(key)) {
          vars[`${key}_LENGTH`] = String(value.length);
          plainSecretsCache[key] = value;
        } else {
          vars[key] = value;
        }
      }
    } catch {}
  }

  const runtimeOverrideKeys = [
    "APP_NAME",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "EXPO_PUBLIC_APP_URL",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_CONVEX_URL",
    "POSTGRES_DB",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "DATABASE_SSL",
    "DATABASE_POOL_SIZE",
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "BETTER_AUTH_SECRET",
    "DATABASE_SSL_CA",
  ];
  for (const key of runtimeOverrideKeys) {
    const envValue = process.env[key];
    if (envValue !== undefined) {
      if (SECRET_ENV_KEYS.includes(key)) {
        vars[`${key}_LENGTH`] = String(envValue.length);
        plainSecretsCache[key] = envValue;
      } else {
        vars[key] = envValue;
      }
    }
  }
  return vars;
}
