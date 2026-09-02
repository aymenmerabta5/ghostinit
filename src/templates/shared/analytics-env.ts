/**
 * Shared analytics env helpers — PostHog product analytics.
 *
 * @repo/config exposes isolated Next, Vite, and Expo validation entrypoints.
 * Generated env files remain audience-filtered so users see only variables
 * consumed by the selected web, mobile, and desktop applications.
 *
 * No timestamps, deterministic output.
 */

import { publicVarLines, type EnvAudience } from "./env/core.js";

const DEFAULT_AUDIENCE: EnvAudience = {
  framework: "nextjs",
  hasWeb: true,
  hasMobile: false,
};

export function analyticsEnvLines(audience: EnvAudience = DEFAULT_AUDIENCE): string[] {
  return [
    "# Analytics — PostHog product analytics + feature flags + experiments + session replay",
    "# Cloud US: https://us.i.posthog.com, EU: https://eu.i.posthog.com, or /ingest proxy to bypass adblockers (default)",
    ...publicVarLines(audience, "POSTHOG_KEY", "phc_REPLACE_WITH_POSTHOG_KEY"),
    ...publicVarLines(audience, "POSTHOG_HOST", "/ingest"),
    "POSTHOG_HOST=https://us.i.posthog.com",
    "POSTHOG_API_KEY=phc_REPLACE_WITH_POSTHOG_KEY # optional if same as public, server-side",
    "FEATURE_FLAG_TIMEOUT_MS=2500",
    ...publicVarLines(audience, "POSTHOG_SESSION_RECORDING", "false"),
    ...publicVarLines(audience, "POSTHOG_AUTOCAPTURE", "true"),
    ...publicVarLines(audience, "ANALYTICS_DISABLED", "false"),
    "ANALYTICS_DISABLED=false",
  ];
}

export function analyticsEnvLocalLines(audience: EnvAudience = DEFAULT_AUDIENCE): string[] {
  return analyticsEnvLines(audience);
}
