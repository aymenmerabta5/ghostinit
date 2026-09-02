/**
 * Shared constants for secret-safe logging, billing, and env handling.
 *
 * Single source of truth for:
 * - SECRET_SUBSTRINGS used to detect secret-like keys
 * - SECRET_PATTERN regex for additional patterns
 * - looksLikeSecret helper
 * - STAGING constants for FsTransaction
 * - Billing provider names (union + array)
 * - Reserved workspace packages (single source, reserved.ts imports)
 */

/**
 * Substrings that indicate a key likely holds a secret.
 * Shared between host CLI logger (src/lib/logger.ts) and
 * generated observability logger (packages/observability/src/logger.ts).
 *
 * Merged superset from both original lists:
 * - host had: secret, password, token, auth, bearer, cookie, credential, key, otp, session
 * - template had: secret, password, token, auth, bearer, cookie, credential, key, otp, session (same)
 * - task spec suggested: secret, password, token, key, auth, signature, private, credential
 *
 * We keep the broader set for maximum safety, including signature/private.
 * Must include at least: secret, password, token, key, auth, signature (task spec).
 */
export const SECRET_SUBSTRINGS = [
  "secret",
  "password",
  "token",
  "auth",
  "bearer",
  "cookie",
  "credential",
  "key",
  "otp",
  "session",
  "signature",
  "private",
] as const;

export type SecretSubstring = (typeof SECRET_SUBSTRINGS)[number];

/**
 * Additional regex patterns for secret detection beyond substring.
 */
export const SECRET_PATTERN =
  /\b(apikey|api_key|jwt|private_key|database_url|db_url|webhook_secret|client_secret|access_token)\b/i;

/**
 * URL query param patterns that likely contain secrets.
 */
export const URL_SECRET_PARAM_PATTERN = /token|key|secret|password|auth|api|signature/i;

export function looksLikeSecret(key: string): boolean {
  const lower = key.toLowerCase();
  for (const needle of SECRET_SUBSTRINGS) {
    if (lower.includes(needle)) return true;
  }
  return SECRET_PATTERN.test(lower);
}

/* ------------------------------------------------------------------ */
/* Billing constants — single source of truth                          */
/* ------------------------------------------------------------------ */

export const BILLING_PROVIDERS = ["stripe", "chargily", "paddle", "polar"] as const;
export type BillingProviderName = (typeof BILLING_PROVIDERS)[number];

// Compatibility aliases — addons.ts historically exported `billingProviders`
export const billingProviders = BILLING_PROVIDERS;
export const ALL_BILLING_PROVIDERS = BILLING_PROVIDERS;
export const BILLING_PROVIDER_NAMES = BILLING_PROVIDERS;

/* ------------------------------------------------------------------ */
/* Convex + env manifest — single source via env-manifest.ts           */
/* ------------------------------------------------------------------ */

export {
  CONVEX_ENV_KEYS,
  ENV_PLACEHOLDERS,
  GLOBAL_ENV_KEYS,
  getGlobalEnvKeys,
} from "./env-manifest.js";

/* ------------------------------------------------------------------ */
/* Reserved workspace packages — single source of truth               */
/* Re-exported from reserved.ts originally, now defined here and    */
/* imported by reserved.ts to ensure single source.                  */
/* ------------------------------------------------------------------ */

export const RESERVED_WORKSPACE_PACKAGES = [
  "api",
  "auth",
  "config",
  "contracts",
  "database",
  "desktop",
  "kernel",
  "mobile",
  "modules",
  "observability",
  "testing",
  "typescript-config",
  "ui",
  "web",
  "workflows",
] as const;

export type ReservedWorkspacePackage = (typeof RESERVED_WORKSPACE_PACKAGES)[number];

/** Staging file constants for FsTransaction */
export const STAGING_SUFFIX = ".ghostinit-staging";
export const STAGING_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Preset names — single source of truth for create wizard */
export const PRESETS = ["saas", "frontend", "custom"] as const;
export type PresetName = (typeof PRESETS)[number];

/** Cache providers — redis = Upstash HTTP */
export const CACHE_PROVIDERS = ["redis", "none"] as const;
export type CacheProvider = (typeof CACHE_PROVIDERS)[number];
