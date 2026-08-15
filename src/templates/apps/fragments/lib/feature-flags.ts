import { file, type TemplateFile } from "../../../shared.js";

// Generic feature flags — scaffolder starter, not domain copy.
// Shows the dual server/client env pattern (server FEATURE_*, client NEXT_PUBLIC_/VITE_) without hardcoding Stagio names.
export function featureFlagsLibFiles(base = "apps/web/src"): TemplateFile[] {
  const serverContent = `import "server-only";
import { env } from "@repo/config";

// Add your flags here. Example:
// BILLING: env.FEATURE_BILLING === "true",
export const FEATURE_FLAGS = {
  EXAMPLE: (env as unknown as Record<string, string | undefined>).FEATURE_EXAMPLE === "true",
} as const;

export type ServerFeatureFlag = keyof typeof FEATURE_FLAGS;
export function isFeatureEnabled(flag: ServerFeatureFlag): boolean {
  return FEATURE_FLAGS[flag] ?? false;
}
`;

  const clientContent = `"use client";
import { env } from "@repo/config";

// Mirror server flags for the browser. Keep keys in sync with feature-flags.ts.
// For Next.js use NEXT_PUBLIC_*, for TanStack Start use VITE_* — the helper handles both.
function pickClientFlag(nextKey: string, viteKey: string): boolean {
  const e = env as unknown as Record<string, string | undefined>;
  return e[nextKey] === "true" || e[viteKey] === "true";
}

export const CLIENT_FEATURE_FLAGS = {
  EXAMPLE: pickClientFlag("NEXT_PUBLIC_FEATURE_EXAMPLE", "VITE_FEATURE_EXAMPLE"),
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
