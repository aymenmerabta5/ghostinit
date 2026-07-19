export function monorepoRootIndexContent(): string {
  return `// Barrel — server-safe exports
export * from "./config.js";
export * from "./types.js";
export * from "./shared/events.js";
export * from "./shared/properties.js";
export * from "./shared/consent.js";
export * from "./server/posthog-server.js";
export * from "./server/utils.js";
export * from "./server/bootstrap.js";
export * from "./integrations/auth.js";
export * from "./integrations/billing.js";
export * from "./testing/mocks.js";

export * as client from "./client/index.js";
export * as server from "./server/index.js";
export * as shared from "./shared/events.js";
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
  return `export * from "./posthog-server.js";
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
  return `"use client";

export * from "./posthog-provider.js";
export * from "./posthog-pageview.js";
export * from "./feature-flag-gate.js";
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
