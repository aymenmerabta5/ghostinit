export function monorepoRootIndexContent(): string {
  return `// Default barrel — environment-neutral analytics contracts and helpers.
// Import runtime implementations explicitly from @repo/analytics/client or
// @repo/analytics/server so client bundles can never traverse server modules.
export * from "./types.js";
export * from "./shared/events.js";
export * from "./shared/properties.js";
export * from "./shared/consent.js";
export * from "./testing/mocks.js";
`;
}

export function monorepoClientIndexContent(): string {
  return `"use client";

export * from "./posthog-client.js";
export * from "./provider.js";
export * from "./pageview.js";
export * from "./hooks.js";
export * from "./components.js";
`;
}

export function monorepoServerIndexContent(): string {
  return `import "server-only";

export * from "../config.js";
export * from "./posthog-server.js";
export * from "./utils.js";
export * from "./bootstrap.js";
`;
}

export function monorepoSharedBarrel(): string {
  return `export * from "./events.js";
export * from "./properties.js";
export * from "./consent.js";
`;
}

export function singleRootIndexContent(): string {
  return `export * from "./config.js";
export * from "./types.js";
export * from "./shared/events.js";
export * from "./shared/properties.js";
export * from "./shared/consent.js";
export * from "./posthog-server.js";
export * from "./utils.js";
export * from "./bootstrap.js";
export * from "./testing/mocks.js";
`;
}

export function singleComponentsIndexContent(): string {
  // Explicit re-exports: both posthog-provider and posthog-pageview export
  // PostHogPageView, and `export *` made that ambiguous (TS2308). The dedicated
  // pageview module is the canonical one.
  return `"use client";

export {
  PostHogProvider,
  PostHogContext,
  usePostHogContext,
  useFeatureFlag,
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
  useActiveFeatureFlags,
  useExperiment,
} from "./posthog-provider.js";
export { PostHogPageView } from "./posthog-pageview.js";
export { FeatureFlagGate, ExperimentGate, PostHogToolbar } from "./feature-flag-gate.js";
`;
}

export function webComponentsAnalyticsReadme(): string {
  return `# Analytics components

- posthog-provider.tsx — PostHogProvider wrapping app, bootstraps flags via SSR.
- posthog-pageview.tsx — captures $pageview on pathname/search changes.
- Feature flag gates, experiment gates, toolbar debug, consent banner.

Usage monorepo:

\`\`\`tsx
import { PostHogProvider } from "@repo/analytics/client";
import { PostHogPageView } from "@repo/analytics/client";

<PostHogProvider bootstrapFlags={flags} distinctId={userId}>
  <PostHogPageView />
  {children}
</PostHogProvider>
\`\`\`

Proxy: Client sends to /api/ingest, which proxies to PostHog with SSRF allowlist.
`;
}
