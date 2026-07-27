import type { ProjectMode } from "../../lib/addons.js";

export function configContent(mode: ProjectMode): string {
  if (mode === "monorepo") {
    return `import { env } from "@repo/config";
import { z } from "zod";

export interface AnalyticsConfig {
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
}

const configSchema = z.object({
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  POSTHOG_API_HOST: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: z.string().optional(),
  ANALYTICS_DISABLED: z.string().optional(),
  NEXT_PUBLIC_ANALYTICS_DISABLED: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

function isDisabledFlag(value: unknown): boolean {
  return value === "true" || value === "1";
}

export function isAnalyticsEnabled(): boolean {
  try {
    const parsed = configSchema.safeParse(env as unknown as Record<string, unknown>);
    if (!parsed.success) return false;
    const e = parsed.data as Record<string, string | undefined>;
    // env carries non-string members (numeric transforms), so the widening cast
    // must go through unknown — a direct assertion is a TS2352 error.
    const rawEnv = env as unknown as Record<string, string | undefined>;
    const disabledFlag =
      e.ANALYTICS_DISABLED ??
      e.NEXT_PUBLIC_ANALYTICS_DISABLED ??
      e.VITE_ANALYTICS_DISABLED ??
      rawEnv.ANALYTICS_DISABLED ??
      rawEnv.NEXT_PUBLIC_ANALYTICS_DISABLED ??
      rawEnv.VITE_ANALYTICS_DISABLED;
    if (isDisabledFlag(disabledFlag)) return false;
    // Public vars are NEXT_PUBLIC_* on Next.js and VITE_* on TanStack Start.
    const key =
      e.NEXT_PUBLIC_POSTHOG_KEY ??
      e.VITE_POSTHOG_KEY ??
      e.POSTHOG_KEY ??
      rawEnv.POSTHOG_KEY ??
      rawEnv.NEXT_PUBLIC_POSTHOG_KEY ??
      rawEnv.VITE_POSTHOG_KEY;
    if (!key || typeof key !== "string" || key.length === 0) return false;
    if (key.includes("REPLACE") || key.includes("placeholder")) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAnalyticsConfig(): AnalyticsConfig {
  // Widening cast goes through unknown: env has non-string members.
  const e = env as unknown as Record<string, string | undefined>;
  // Public prefix is NEXT_PUBLIC_ on Next.js and VITE_ on TanStack Start.
  const rawHost =
    e.NEXT_PUBLIC_POSTHOG_HOST ??
    e.VITE_POSTHOG_HOST ??
    e.POSTHOG_HOST ??
    e.POSTHOG_API_HOST;

  const isDev = e.NODE_ENV !== "production";

  return {
    // key/host are declared as plain strings, so fall back rather than leaking
    // an optional (TS2322). An empty key means "not configured", which
    // isAnalyticsEnabled() already treats as disabled.
    key: e.NEXT_PUBLIC_POSTHOG_KEY ?? e.VITE_POSTHOG_KEY ?? e.POSTHOG_KEY ?? "",
    host: rawHost ?? "https://us.i.posthog.com",
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: parseEnvBoolean(
      e.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE ?? e.VITE_POSTHOG_AUTOCAPTURE,
      true,
    ),
    capturePageview: false,
    capturePageleave: true,
    sessionRecording: parseEnvBoolean(
      e.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING ?? e.VITE_POSTHOG_SESSION_RECORDING,
      !isDev,
    ),
    persistence: "localStorage+cookie",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

export function getClientAnalyticsConfig() {
  const cfg = getAnalyticsConfig();
  return {
    key: cfg.key,
    host: cfg.host,
    enabled: cfg.enabled,
    debug: cfg.debug,
    apiEndpoint: cfg.apiEndpoint,
  };
}
`;
  }
  return `import { z } from "zod";

export interface AnalyticsConfig {
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
}

const configSchema = z.object({
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  POSTHOG_API_HOST: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: z.string().optional(),
  ANALYTICS_DISABLED: z.string().optional(),
  NEXT_PUBLIC_ANALYTICS_DISABLED: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

function readEnv(): Record<string, string | undefined> {
  if (typeof process === "undefined") return {};
  return process.env as Record<string, string | undefined>;
}

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

function isDisabledFlag(value: unknown): boolean {
  return value === "true" || value === "1";
}

export function isAnalyticsEnabled(): boolean {
  try {
    const env = readEnv();
    const parsed = configSchema.safeParse(env);
    if (!parsed.success) return false;
    const disabledFlag = env.ANALYTICS_DISABLED ?? env.NEXT_PUBLIC_ANALYTICS_DISABLED;
    if (isDisabledFlag(disabledFlag)) return false;
    const key = env.NEXT_PUBLIC_POSTHOG_KEY ?? env.POSTHOG_KEY;
    if (!key) return false;
    if (key.includes("REPLACE") || key.includes("placeholder")) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAnalyticsConfig(): AnalyticsConfig {
  const env = readEnv();
  // Public prefix is NEXT_PUBLIC_ on Next.js and VITE_ on TanStack Start.
  const rawHost =
    env.NEXT_PUBLIC_POSTHOG_HOST ??
    env.VITE_POSTHOG_HOST ??
    env.POSTHOG_HOST ??
    env.POSTHOG_API_HOST;

  const isDev = env.NODE_ENV !== "production";

  return {
    // key/host are plain strings; fall back rather than leaking an optional (TS2322).
    key: env.NEXT_PUBLIC_POSTHOG_KEY ?? env.VITE_POSTHOG_KEY ?? env.POSTHOG_KEY ?? "",
    host: rawHost ?? "https://us.i.posthog.com",
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: parseEnvBoolean(
      env.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE,
      true,
    ),
    capturePageview: false,
    capturePageleave: true,
    sessionRecording: parseEnvBoolean(
      env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING,
      !isDev,
    ),
    persistence: "localStorage+cookie",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

export function getClientAnalyticsConfig() {
  const cfg = getAnalyticsConfig();
  return {
    key: cfg.key,
    host: cfg.host,
    enabled: cfg.enabled,
    debug: cfg.debug,
    apiEndpoint: cfg.apiEndpoint,
  };
}
`;
}
