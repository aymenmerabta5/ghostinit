import type { ProjectMode } from "../../lib/addons.js";

const ANALYTICS_CONFIG_INTERFACE = `export interface AnalyticsConfig {
  key: string;
  host: string;
  enabled: boolean;
  debug: boolean;
  autocapture: boolean;
  capturePageview: boolean;
  capturePageleave: boolean;
  sessionRecording: boolean;
  persistence: "localStorage+cookie" | "cookie" | "memory" | "localStorage";
  personProfiles: "identified_only" | "always" | "never";
  apiEndpoint: string;
  flushAt: number;
  flushIntervalMs: number;
}`;

export function configContent(mode: ProjectMode): string {
  const configImport = mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server";
  return `import "server-only";
import { env } from "${configImport}";

${ANALYTICS_CONFIG_INTERFACE}

export function isAnalyticsEnabled(): boolean {
  const key = env.POSTHOG_API_KEY;
  if (env.ANALYTICS_DISABLED === "true" || !key) return false;
  return !key.includes("REPLACE") && !key.includes("placeholder");
}

export function getAnalyticsConfig(): AnalyticsConfig {
  const isDev = env.NODE_ENV !== "production";
  return {
    key: env.POSTHOG_API_KEY ?? "",
    host: env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: false,
    capturePageview: false,
    capturePageleave: false,
    sessionRecording: false,
    persistence: "memory",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

export function getClientAnalyticsConfig() {
  const config = getAnalyticsConfig();
  return {
    key: "",
    host: "",
    enabled: false,
    debug: config.debug,
    apiEndpoint: config.apiEndpoint,
  };
}
`;
}

export function clientConfigContent(
  mode: ProjectMode,
  framework: "nextjs" | "tanstack-start",
): string {
  const isVite = framework === "tanstack-start";
  const configImport =
    mode === "monorepo"
      ? isVite
        ? "@repo/config/vite"
        : "@repo/config/next"
      : isVite
        ? "@/lib/env/vite"
        : "@/lib/env/next";
  const prefix = isVite ? "VITE_" : "NEXT_PUBLIC_";

  return `import { env, isDevelopment } from "${configImport}";

${ANALYTICS_CONFIG_INTERFACE}

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

export function isAnalyticsEnabled(): boolean {
  if (env.${prefix}ANALYTICS_DISABLED === "true") return false;
  const key = env.${prefix}POSTHOG_KEY;
  return Boolean(key && !key.includes("REPLACE") && !key.includes("placeholder"));
}

export function getAnalyticsConfig(): AnalyticsConfig {
  const isDev = isDevelopment;
  return {
    key: env.${prefix}POSTHOG_KEY ?? "",
    host: env.${prefix}POSTHOG_HOST ?? "https://us.i.posthog.com",
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: parseEnvBoolean(env.${prefix}POSTHOG_AUTOCAPTURE, true),
    capturePageview: false,
    capturePageleave: true,
    sessionRecording: parseEnvBoolean(env.${prefix}POSTHOG_SESSION_RECORDING, !isDev),
    persistence: "localStorage+cookie",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

export function getClientAnalyticsConfig() {
  const config = getAnalyticsConfig();
  return {
    key: config.key,
    host: config.host,
    enabled: config.enabled,
    debug: config.debug,
    apiEndpoint: config.apiEndpoint,
  };
}
`;
}
