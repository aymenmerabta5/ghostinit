/**
 * Environment manifest — single source of truth for env vars.
 *
 * Fixes 5-place fragility: previously adding a var required editing
 * 1) src/lib/constants.ts ENV_PLACEHOLDERS
 * 2) src/templates/shared/env/* builders
 * 3) src/templates/root/turbo.ts globalEnv
 * 4) root turbo.json globalEnv
 * 5) CONTRIBUTING.md + AGENTS.md
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
  BILLING_STRIPE_PRO_PRICE_ID: "REPLACE_WITH_STRIPE_PRO_PRICE_ID",
  CHARGILY_API_KEY: "REPLACE_WITH_CHARGILY_API_KEY",
  CHARGILY_SECRET: "REPLACE_WITH_CHARGILY_SECRET_KEY",
  BILLING_CHARGILY_PRO_PRICE_ID: "REPLACE_WITH_CHARGILY_PRO_PRICE_ID",
  PADDLE_API_KEY: "REPLACE_WITH_PADDLE_API_KEY",
  PADDLE_WEBHOOK_SECRET: "REPLACE_WITH_PADDLE_WEBHOOK_SECRET",
  PADDLE_CLIENT_TOKEN: "pdl_ntf_REPLACE",
  BILLING_PADDLE_PRO_PRICE_ID: "REPLACE_WITH_PADDLE_PRO_PRICE_ID",
  POLAR_ACCESS_TOKEN: "REPLACE_WITH_POLAR_ACCESS_TOKEN",
  POLAR_WEBHOOK_SECRET: "REPLACE_WITH_POLAR_WEBHOOK_SECRET",
  POLAR_ORG_ID: "REPLACE_WITH_POLAR_ORG_ID",
  BILLING_POLAR_PRO_PRODUCT_ID: "REPLACE_WITH_POLAR_PRO_PRODUCT_ID",
  POSTHOG_KEY: "phc_REPLACE_WITH_POSTHOG_KEY",
  FEATURE_FLAG_TIMEOUT_MS: "2500",
  NOTIFICATION_TOKEN_ENCRYPTION_KEY: "REPLACE_WITH_32_BYTE_BASE64URL_KEY",
  AI_GATEWAY_API_KEY: "REPLACE_WITH_AI_GATEWAY_API_KEY",
  EVE_INTERNAL_AUTH_SECRET: "REPLACE_WITH_A_STRONG_RANDOM_SECRET_AT_LEAST_32_CHARS",
  EVE_NEXT_PRODUCTION_ORIGIN: "",
  EVE_NEXT_PRODUCTION_PORT: "4274",
  JOB_WORKER_ID: "",
  JOB_WORKER_POLL_MS: "1000",
  JOB_HEARTBEAT_MS: "10000",
  JOB_LEASE_MS: "30000",
  JOB_SCHEDULER_TICK_MS: "30000",
  UPSTASH_REDIS_REST_URL: "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
  UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
  STORAGE_DRIVER: "local",
  STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
  S3_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "REPLACE_WITH_S3_ACCESS_KEY_ID",
  S3_SECRET_ACCESS_KEY: "REPLACE_WITH_S3_SECRET_ACCESS_KEY",
  S3_ENDPOINT: "",
  S3_PUBLIC_URL: "",
  UPLOADS_DIR: "./data/uploads",
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
 * Wildcards last (NEXT_PUBLIC_*, VITE_*, EXPO_PUBLIC_*, DESKTOP_*).
 */
export const GLOBAL_ENV_KEYS: readonly string[] = [
  "NODE_ENV",
  "RUNTIME",
  "APP_NAME",
  "TRUSTED_PROXY",
  "MAINTENANCE_MODE",
  "MAINTENANCE_BYPASS_TOKEN",
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
  "BILLING_STRIPE_PRO_PRICE_ID",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  // Chargily
  "CHARGILY_API_KEY",
  "CHARGILY_SECRET_KEY",
  "CHARGILY_MODE",
  "CHARGILY_WEBHOOK_SECRET",
  "BILLING_CHARGILY_PRO_PRICE_ID",
  // Paddle
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "PADDLE_CLIENT_TOKEN",
  "PADDLE_ENVIRONMENT",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_ENVIRONMENT",
  "VITE_PADDLE_CLIENT_TOKEN",
  "VITE_PADDLE_ENVIRONMENT",
  "BILLING_PADDLE_PRO_PRICE_ID",
  // Polar
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_ORG_ID",
  "POLAR_ENVIRONMENT",
  "POLAR_CLIENT_ID",
  "BILLING_POLAR_PRO_PRODUCT_ID",
  // PostHog / analytics
  "POSTHOG_HOST",
  "POSTHOG_API_KEY",
  "FEATURE_FLAG_TIMEOUT_MS",
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
  // Notification inbox/device security
  "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
  // Eve durable-agent integration
  "AI_GATEWAY_API_KEY",
  "EVE_INTERNAL_AUTH_SECRET",
  "EVE_NEXT_PRODUCTION_ORIGIN",
  "EVE_NEXT_PRODUCTION_PORT",
  // Durable jobs
  "JOB_WORKER_ID",
  "JOB_WORKER_POLL_MS",
  "JOB_HEARTBEAT_MS",
  "JOB_LEASE_MS",
  "JOB_SCHEDULER_TICK_MS",
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
  "DESKTOP_*",
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
  "S3_PUBLIC_URL",
  "UPLOADS_DIR",
  // Convex — re-include via spread to ensure single source stays authoritative
  ...CONVEX_ENV_KEYS,
] as const;

export interface GlobalEnvAudience {
  readonly framework?: "nextjs" | "tanstack-start" | string;
  readonly hasWeb?: boolean;
  readonly hasMobile?: boolean;
  readonly hasDesktop?: boolean;
  readonly hasEve?: boolean;
}

const EVE_ENV_KEYS = new Set([
  "AI_GATEWAY_API_KEY",
  "EVE_INTERNAL_AUTH_SECRET",
  "EVE_NEXT_PRODUCTION_ORIGIN",
  "EVE_NEXT_PRODUCTION_PORT",
]);

function publicEnvironmentFamily(key: string): "next" | "vite" | "expo" | "desktop" | null {
  if (key.startsWith("NEXT_PUBLIC_")) return "next";
  if (key.startsWith("VITE_")) return "vite";
  if (key.startsWith("EXPO_PUBLIC_")) return "expo";
  if (key.startsWith("DESKTOP_")) return "desktop";
  return null;
}

/** Deduplicated globalEnv preserving order — use for turbo.json generation. */
export function getGlobalEnvKeys(
  runtime: "node" | "bun" = "bun",
  audience?: GlobalEnvAudience,
): string[] {
  // Execution runtime selection must not change package-manager cache keys.
  // The canonical Bun version is the only supported package manager for every runtime.
  void runtime;
  const deduped = [...new Set(GLOBAL_ENV_KEYS)];
  if (!audience) return deduped;

  const hasWeb = audience.hasWeb ?? true;
  const hasDesktop = audience.hasDesktop === true;
  const enabledFamilies = new Set<"next" | "vite" | "expo" | "desktop">();
  if (hasWeb) {
    enabledFamilies.add(audience.framework === "tanstack-start" ? "vite" : "next");
  }
  if (audience.hasMobile) enabledFamilies.add("expo");
  if (hasDesktop) {
    enabledFamilies.add("vite");
    enabledFamilies.add("desktop");
  }

  return deduped.filter((key) => {
    if (audience.hasEve !== true && EVE_ENV_KEYS.has(key)) return false;
    const family = publicEnvironmentFamily(key);
    if (family && !enabledFamilies.has(family)) return false;
    if (!hasDesktop && (key === "ELECTRON_IS_DEV" || key === "ELECTRON_*")) return false;
    return true;
  });
}
