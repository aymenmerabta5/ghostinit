import { file, type TemplateFile } from "../../../shared.js";

// Generic feature flags — scaffolder starter, not domain copy.
// Shows the dual server/client env pattern (server FEATURE_*, client NEXT_PUBLIC_/VITE_) without hardcoding Stagio names.
export function featureFlagsLibFiles(
  base = "apps/web/src",
  framework: "nextjs" | "tanstack-start" = "nextjs",
): TemplateFile[] {
  const configImport = base === "src" ? "@/lib/env/server" : "@repo/config/server";
  const publicEntry = framework === "tanstack-start" ? "vite" : "next";
  const clientConfigImport =
    base === "src" ? `@/lib/env/${publicEntry}` : `@repo/config/${publicEntry}`;
  const clientAnalyticsDisabled =
    framework === "tanstack-start"
      ? "env.VITE_ANALYTICS_DISABLED"
      : "env.NEXT_PUBLIC_ANALYTICS_DISABLED";
  const serverContent = `import "server-only";
import { env } from "${configImport}";

export const FEATURE_FLAGS = {
  ANALYTICS: env.ANALYTICS_DISABLED !== "true",
} as const;

export type ServerFeatureFlag = keyof typeof FEATURE_FLAGS;
export function isFeatureEnabled(flag: ServerFeatureFlag): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}
`;

  const clientContent = `"use client";
import { env } from "${clientConfigImport}";

export const CLIENT_FEATURE_FLAGS = {
  ANALYTICS: ${clientAnalyticsDisabled} !== "true",
} as const;

export type ClientFeatureFlag = keyof typeof CLIENT_FEATURE_FLAGS;
export function isClientFeatureEnabled(flag: ClientFeatureFlag): boolean {
  return CLIENT_FEATURE_FLAGS[flag] ?? false;
}
`;
  return [
    file(`${base}/lib/feature-flags.ts`, serverContent),
    file(`${base}/lib/feature-flags-client.ts`, clientContent),
  ];
}
