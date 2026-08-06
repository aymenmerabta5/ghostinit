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
/* Convex constants                                                   */
/* ------------------------------------------------------------------ */

export const CONVEX_ENV_KEYS = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "VITE_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_URL",
  "CONVEX_SITE_URL",
  "SITE_URL",
] as const;

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
  "kernel",
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

/** Placeholder constants for env generation */
export const ENV_PLACEHOLDERS = {
  BETTER_AUTH_SECRET: "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS",
  POSTGRES_PASSWORD: "REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD",
  RESEND_API_KEY: "REPLACE_WITH_RESEND_API_KEY",
  STRIPE_SECRET_KEY: "REPLACE_WITH_STRIPE_SECRET_KEY",
  STRIPE_WEBHOOK_SECRET: "REPLACE_WITH_STRIPE_WEBHOOK_SECRET",
  STRIPE_PUBLISHABLE: "pk_test_REPLACE",
  CHARGILY_API_KEY: "REPLACE_WITH_CHARGILY_API_KEY",
  CHARGILY_SECRET: "REPLACE_WITH_CHARGILY_SECRET_KEY",
  PADDLE_API_KEY: "REPLACE_WITH_PADDLE_API_KEY",
  PADDLE_WEBHOOK_SECRET: "REPLACE_WITH_PADDLE_WEBHOOK_SECRET",
  PADDLE_CLIENT_TOKEN: "pdl_ntf_REPLACE",
  POLAR_ACCESS_TOKEN: "REPLACE_WITH_POLAR_ACCESS_TOKEN",
  POLAR_WEBHOOK_SECRET: "REPLACE_WITH_POLAR_WEBHOOK_SECRET",
  POLAR_ORG_ID: "REPLACE_WITH_POLAR_ORG_ID",
  POSTHOG_KEY: "phc_REPLACE_WITH_POSTHOG_KEY",
  UPSTASH_REDIS_REST_URL: "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
  UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
  CONVEX_DEPLOYMENT: "REPLACE_WITH_CONVEX_DEPLOYMENT_dev:example-123",
  CONVEX_URL: "REPLACE_WITH_CONVEX_URL_https://example-123.convex.cloud",
  NEXT_PUBLIC_CONVEX_URL: "REPLACE_WITH_CONVEX_URL_https://example-123.convex.cloud",
  CONVEX_SITE_URL: "REPLACE_WITH_CONVEX_SITE_URL_https://example-123.convex.site",
  SITE_URL: "http://localhost:3000",
} as const;
