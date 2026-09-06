import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_DOTENV_FILE_BYTES, parseDotenvAssignments } from "../../lib/dotenv.js";

export { parseDotenvLine as parseEnvLine } from "../../lib/dotenv.js";

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

export async function loadEnvMap(
  root: string,
  options: { cloudflare?: boolean } = {},
): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  clearSecretCache();
  const environmentFiles = options.cloudflare
    ? [".dev.vars"]
    : [".env", ".env.development", ".env.production", ".env.local"];
  for (const fileName of environmentFiles) {
    try {
      const path = join(root, fileName);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_DOTENV_FILE_BYTES)
        continue;
      const raw = await readFile(path, "utf-8");
      for (const [key, value] of parseDotenvAssignments(raw)) {
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
    "VITE_APP_URL",
    "EXPO_PUBLIC_APP_URL",
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_CONVEX_URL",
    "CONVEX_DEPLOYMENT",
    "CONVEX_URL",
    "CONVEX_SITE_URL",
    "NEXT_PUBLIC_CONVEX_URL",
    "VITE_CONVEX_URL",
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
