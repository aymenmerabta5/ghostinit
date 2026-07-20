export function singleLibAnalyticsContent(): string {
  return `"use client";

import posthog, { type PostHog, type PostHogConfig } from "posthog-js";

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
    const disabledFlag = env.ANALYTICS_DISABLED ?? env.NEXT_PUBLIC_ANALYTICS_DISABLED;
    if (isDisabledFlag(disabledFlag)) return false;
    const key = env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return false;
    if (key.includes("REPLACE") || key.includes("placeholder")) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAnalyticsConfig(): AnalyticsConfig {
  const env = readEnv();
  const rawHost = env.NEXT_PUBLIC_POSTHOG_HOST ?? env.POSTHOG_HOST ?? env.NEXT_PUBLIC_POSTHOG_HOST;
  const isDev = env.NODE_ENV !== "production";
  return {
    key: env.NEXT_PUBLIC_POSTHOG_KEY ?? env.POSTHOG_KEY ?? env.NEXT_PUBLIC_POSTHOG_KEY,
    host: rawHost,
    enabled: isAnalyticsEnabled(),
    debug: isDev,
    autocapture: parseEnvBoolean(env.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE, true),
    capturePageview: false,
    capturePageleave: true,
    sessionRecording: parseEnvBoolean(env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING, !isDev),
    persistence: "localStorage+cookie",
    personProfiles: "identified_only",
    apiEndpoint: "/api/ingest",
    flushAt: 20,
    flushIntervalMs: 10_000,
  };
}

const CONSENT_STORAGE_KEY = "ghostinit:consent";
const CONSENT_COOKIE_KEY = "ghostinit_consent";

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = "__consent_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

interface LocalConsentState {
  status: "granted" | "denied" | "pending" | "unknown";
  categories: Record<string, boolean>;
  timestamp?: string;
  version: number;
}

function getConsentState(): LocalConsentState {
  const fallback: LocalConsentState = {
    status: "unknown",
    categories: { necessary: true, analytics: false, marketing: false, preferences: false },
    version: 1,
  };
  if (!canUseStorage()) {
    const cookieRaw = readCookie(CONSENT_COOKIE_KEY);
    if (cookieRaw) {
      try {
        return JSON.parse(cookieRaw) as LocalConsentState;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return fallback;
    return JSON.parse(raw) as LocalConsentState;
  } catch {
    return fallback;
  }
}

function hasConsent(category = "analytics"): boolean {
  const state = getConsentState();
  if (state.status === "granted") return Boolean((state.categories as Record<string, boolean>)[category]);
  if (state.status === "denied") return false;
  return false;
}

let clientInstance: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;

function canUseWindow(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function getPostHogClient(): PostHog | null {
  if (!canUseWindow()) return null;
  return clientInstance;
}

export async function initPostHogClient(options?: {
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
}): Promise<PostHog | null> {
  if (!canUseWindow()) return null;
  if (clientInstance) return clientInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!isAnalyticsEnabled()) return null;
      const cfg = getAnalyticsConfig();
      if (!cfg.key) return null;
      posthog.init(cfg.key, {
        api_host: cfg.apiEndpoint,
        ui_host: cfg.host,
        autocapture: cfg.autocapture,
        capture_pageview: cfg.capturePageview,
        capture_pageleave: cfg.capturePageleave,
        persistence: cfg.persistence as PostHogConfig["persistence"],
        person_profiles: cfg.personProfiles as PostHogConfig["person_profiles"],
        bootstrap: options?.bootstrapFlags
          ? {
              distinctID: "bootstrap",
              featureFlags: options.bootstrapFlags,
              featureFlagPayloads: options.bootstrapPayloads,
            }
          : undefined,
        loaded: (ph) => {
          try {
            if (!canUseWindow()) return;
            (window as unknown as { posthog?: PostHog }).posthog = ph;
            if (!hasConsent("analytics")) ph.opt_out_capturing();
          } catch {}
        },
        session_recording: { maskAllInputs: true },
        opt_out_capturing_by_default: false,
        respect_dnt: true,
        disable_session_recording: !cfg.sessionRecording,
      });
      clientInstance = posthog as unknown as PostHog;
      return clientInstance;
    } catch (err) {
      console.warn("[analytics] init failed", err);
      return null;
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
}

export function captureClientEvent(event: string, properties?: Record<string, unknown>): void {
  if (!canUseWindow()) return;
  try {
    const c = getPostHogClient();
    if (!c) return;
    if (!hasConsent("analytics")) return;
    c.capture(event, properties);
  } catch {}
}

export function identifyClientUser(distinctId: string, traits?: Record<string, unknown>): void {
  if (!canUseWindow()) return;
  try {
    getPostHogClient()?.identify(distinctId, traits);
  } catch {}
}

export function resetClient(): void {
  if (!canUseWindow()) return;
  try {
    getPostHogClient()?.reset();
  } catch {}
}
`;
}
