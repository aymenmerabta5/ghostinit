/**
 * Environment manifest — single source of truth for env vars.
 *
 * Fixes 5-place fragility: previously adding a var required editing
 * 1) src/lib/constants.ts ENV_PLACEHOLDERS
 * 2) src/templates/shared/env/* builders
 * 3) src/templates/root/turbo.ts globalEnv
 * 4) root turbo.json globalEnv
 * 5) docs/ARCHITECTURE.md + AGENTS.md
 *
 * Now: edit this file only. All consumers derive from it.
 * - ENV_PLACEHOLDERS: placeholder values for .env.example / .env.local
 * - GLOBAL_ENV_KEYS: exhaustive turbo globalEnv (host + generated)
 * - CONVEX_ENV_KEYS: subset for convex (re-exported via constants.ts)
 *
 * Generated builders (billing.ts, core.ts, builders.ts) and
 * host turbo.json are derived from this manifest via imports or
 * scripts/sync-turbo-env.ts.
 */

export const ENV_PLACEHOLDERS = {
  BETTER_AUTH_SECRET: "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS",
  POSTGRES_PASSWORD: "REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD",
  RESEND_API_KEY: "REPLACE_WITH_RESEND_API_KEY",
  GOOGLE_CLIENT_ID: "REPLACE_WITH_GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "REPLACE_WITH_GOOGLE_CLIENT_SECRET",
  GITHUB_CLIENT_ID: "REPLACE_WITH_GITHUB_CLIENT_ID",
  GITHUB_CLIENT_SECRET: "REPLACE_WITH_GITHUB_CLIENT_SECRET",
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

export const CONVEX_ENV_KEYS = [
  "CONVEX_DEPLOYMENT",
  "CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "VITE_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_URL",
  "CONVEX_SITE_URL",
  "SITE_URL",
] as const;

/**
 * Exhaustive globalEnv for turbo — host + generated.
 * Ordered: core, auth, billing per provider, analytics, convex, deploy, wildcards.
 * Wildcards last (NEXT_PUBLIC_*, VITE_*, EXPO_PUBLIC_*).
 */
export const GLOBAL_ENV_KEYS: readonly string[] = [
  "NODE_ENV",
  "RUNTIME",
  "APP_NAME",
  "TRUSTED_PROXY",
  "DATABASE_URL",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
  "DATABASE_SSL",
  "DATABASE_SSL_CA",
  "DATABASE_POOL_SIZE",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "VITE_APP_URL",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  // Stripe
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  // Chargily
  "CHARGILY_API_KEY",
  "CHARGILY_SECRET_KEY",
  "CHARGILY_MODE",
  "CHARGILY_WEBHOOK_SECRET",
  // Paddle
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_CLIENT_TOKEN",
  "PADDLE_ENVIRONMENT",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_ENVIRONMENT",
  "VITE_PADDLE_CLIENT_TOKEN",
  "VITE_PADDLE_ENVIRONMENT",
  // Polar
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_ORG_ID",
  "POLAR_ENVIRONMENT",
  "POLAR_CLIENT_ID",
  // PostHog / analytics
  "POSTHOG_HOST",
  "POSTHOG_API_KEY",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_SESSION_RECORDING",
  "NEXT_PUBLIC_POSTHOG_AUTOCAPTURE",
  "VITE_POSTHOG_KEY",
  "VITE_POSTHOG_HOST",
  "VITE_POSTHOG_SESSION_RECORDING",
  "VITE_POSTHOG_AUTOCAPTURE",
  "ANALYTICS_DISABLED",
  "NEXT_PUBLIC_ANALYTICS_DISABLED",
  "VITE_ANALYTICS_DISABLED",
  // Convex (expanded via CONVEX_ENV_KEYS for single source, keep explicit for readability)
  "VITE_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "CONVEX_URL",
  "CONVEX_DEPLOYMENT",
  // Electron / deploy
  "ELECTRON_IS_DEV",
  "ELECTRON_*",
  // Wildcards — must be last for turbo cache correctness
  "NEXT_PUBLIC_*",
  "VITE_*",
  "EXPO_PUBLIC_*",
  // Explicit EXPO_PUBLIC_ keys (also covered by wildcard but explicit for cache precision)
  "EXPO_PUBLIC_APP_URL",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_POSTHOG_KEY",
  "EXPO_PUBLIC_POSTHOG_HOST",
  "EXPO_PUBLIC_POSTHOG_SESSION_RECORDING",
  "EXPO_PUBLIC_POSTHOG_AUTOCAPTURE",
  "EXPO_PUBLIC_ANALYTICS_DISABLED",
  "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_PADDLE_CLIENT_TOKEN",
  "EXPO_PUBLIC_PADDLE_ENVIRONMENT",
  // Cache
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  // Messaging — WS URLs derived from APP_URL but explicit for turbo cache precision
  // Postgres: WS via oRPC (Bun.serve / crossws), Convex: no WS (native reactivity), ignored when messaging off
  "NEXT_PUBLIC_WS_URL",
  "VITE_WS_URL",
  "EXPO_PUBLIC_WS_URL",
  "WS_URL",
  "STORAGE_DRIVER",
  "STORAGE_BUCKET",
  "S3_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_ENDPOINT",
  "UPLOADS_DIR",
  // Convex — re-include via spread to ensure single source stays authoritative
  ...CONVEX_ENV_KEYS,
] as const;

/** Deduplicated globalEnv preserving order — use for turbo.json generation. */
export function getGlobalEnvKeys(runtime: "node" | "bun" = "bun"): string[] {
  const deduped = [...new Set(GLOBAL_ENV_KEYS)];
  if (runtime === "node") deduped.push("npm_config_user_agent");
  return deduped;
}
