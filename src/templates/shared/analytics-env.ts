/**
 * Shared analytics env helpers — PostHog product analytics.
 *
 * The public prefix is framework-specific: @repo/config declares exactly ONE
 * client family (NEXT_PUBLIC_ for Next.js via @t3-oss/env-nextjs, VITE_ for
 * TanStack Start via @t3-oss/env-core with clientPrefix), plus EXPO_PUBLIC_ only
 * when a mobile app exists. Emitting all three unconditionally put variables in
 * .env.example that the schema validating it never declares.
 *
 * No timestamps, deterministic output.
 */

import { publicVarLines, type EnvAudience } from "./env/core.js";

const DEFAULT_AUDIENCE: EnvAudience = { framework: "nextjs", hasMobile: false };

export function analyticsEnvLines(audience: EnvAudience = DEFAULT_AUDIENCE): string[] {
  return [
    "# Analytics — PostHog product analytics + feature flags + experiments + session replay",
    "# Cloud US: https://us.i.posthog.com, EU: https://eu.i.posthog.com, or /ingest proxy to bypass adblockers (default)",
    ...publicVarLines(audience, "POSTHOG_KEY", "phc_REPLACE_WITH_POSTHOG_KEY"),
    ...publicVarLines(audience, "POSTHOG_HOST", "/ingest"),
    "POSTHOG_HOST=https://us.i.posthog.com",
    "POSTHOG_API_KEY=phc_REPLACE_WITH_POSTHOG_KEY # optional if same as public, server-side",
    ...publicVarLines(audience, "POSTHOG_SESSION_RECORDING", "false"),
    ...publicVarLines(audience, "POSTHOG_AUTOCAPTURE", "true"),
    ...publicVarLines(audience, "ANALYTICS_DISABLED", "false"),
    "ANALYTICS_DISABLED=false",
  ];
}

export function analyticsEnvLocalLines(audience: EnvAudience = DEFAULT_AUDIENCE): string[] {
  return analyticsEnvLines(audience);
}
