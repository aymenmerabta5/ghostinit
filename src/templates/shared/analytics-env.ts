/**
 * Shared analytics env helpers — PostHog product analytics.
 * Provides analyticsEnvLines used by templates (similar to billing-env.ts).
 * No timestamps, deterministic output.
 */

export function analyticsEnvLines(): string[] {
  return [
    "# Analytics — PostHog product analytics + feature flags + experiments + session replay",
    "# Cloud US: https://us.i.posthog.com, EU: https://eu.i.posthog.com, or /ingest proxy to bypass adblockers (default)",
    "NEXT_PUBLIC_POSTHOG_KEY=phc_REPLACE_WITH_POSTHOG_KEY",
    "NEXT_PUBLIC_POSTHOG_HOST=/ingest",
    "POSTHOG_HOST=https://us.i.posthog.com",
    "POSTHOG_API_KEY=phc_REPLACE_WITH_POSTHOG_KEY # optional if same as public, server-side",
    "NEXT_PUBLIC_POSTHOG_SESSION_RECORDING=false",
    "NEXT_PUBLIC_POSTHOG_AUTOCAPTURE=true",
    "NEXT_PUBLIC_ANALYTICS_DISABLED=false",
  ];
}

export function analyticsEnvLocalLines(): string[] {
  return analyticsEnvLines();
}
