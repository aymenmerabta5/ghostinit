export const PROJECT_MODES = ["monorepo", "single"] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

/** Canonical project/app identifier grammar shared by resolution boundaries. */
export const PROJECT_NAME_PATTERN = /^[a-z](?:[a-z0-9]|-[a-z0-9])*$/;

/** Leave room for generated suffixes below common 255-byte component limits. */
export const PORTABLE_NAME_MAX_UTF8_BYTES = 100;

const WINDOWS_RESERVED_DEVICE_BASENAME =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9]|lpt[1-9])$/i;

/** Windows reserves these basenames even when an extension is present. */
export function isWindowsReservedDeviceName(value: string): boolean {
  const basename = value.split(".", 1)[0]?.replace(/[ .]+$/g, "") ?? "";
  return WINDOWS_RESERVED_DEVICE_BASENAME.test(basename);
}

export function portableNameUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export const APP_TARGETS = ["nextjs", "tanstack-start", "expo", "electron"] as const;
export type AppTarget = (typeof APP_TARGETS)[number];

export const SERVER_APP_TARGETS = [
  "nextjs",
  "tanstack-start",
] as const satisfies readonly AppTarget[];
export type ServerAppTarget = (typeof SERVER_APP_TARGETS)[number];

export const DATABASE_PROVIDERS = ["postgres", "convex", "none"] as const;
export type DatabaseProvider = (typeof DATABASE_PROVIDERS)[number];

export const CACHE_PROVIDERS = ["redis", "none"] as const;
export type CacheProvider = (typeof CACHE_PROVIDERS)[number];

export const DEPLOY_TARGETS = ["vercel", "fly", "docker", "cloudflare", "none"] as const;
export type DeployTarget = (typeof DEPLOY_TARGETS)[number];

export const EXECUTION_RUNTIMES = ["bun", "node"] as const;
export type ExecutionRuntime = (typeof EXECUTION_RUNTIMES)[number];

export const BILLING_PROVIDERS = ["stripe", "chargily", "paddle", "polar"] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];

export const FEATURE_FLAG_PROVIDERS = ["posthog"] as const;
export type FeatureFlagProvider = (typeof FEATURE_FLAG_PROVIDERS)[number];

export const PACKAGE_MANAGERS = [{ name: "bun", version: runtime.bun }] as const;
export type PackageManagerName = (typeof PACKAGE_MANAGERS)[number]["name"];
export type PackageManagerVersion = (typeof PACKAGE_MANAGERS)[number]["version"];
import { runtime } from "../../../packages/versions/src/index.js";
