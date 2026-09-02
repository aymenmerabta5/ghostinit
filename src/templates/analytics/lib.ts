export function singleLibAnalyticsContent(): string {
  return `"use client";

import posthog, { type PostHogConfig, type PostHogInterface } from "posthog-js";
import { getAnalyticsConfig, isAnalyticsEnabled } from "./analytics-config.js";

export { getAnalyticsConfig, getClientAnalyticsConfig, isAnalyticsEnabled } from "./analytics-config.js";
export type { AnalyticsConfig } from "./analytics-config.js";

declare global {
  interface Window {
    posthog?: PostHogInterface;
  }
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

let clientInstance: PostHogInterface | null = null;
let initPromise: Promise<PostHogInterface | null> | null = null;

function canUseWindow(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function getPostHogClient(): PostHogInterface | null {
  if (!canUseWindow()) return null;
  return clientInstance;
}

export async function initPostHogClient(options?: {
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
}): Promise<PostHogInterface | null> {
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
        // posthog-js types featureFlagPayloads as JSON values; assert to the SDK's
        // own BootstrapConfig rather than leaking an incompatible literal (TS2322).
        bootstrap: options?.bootstrapFlags
          ? ({
              distinctID: "bootstrap",
              featureFlags: options.bootstrapFlags,
              featureFlagPayloads: options.bootstrapPayloads,
            } as PostHogConfig["bootstrap"])
          : undefined,
        loaded: (ph) => {
          try {
            if (!canUseWindow()) return;
            window.posthog = ph;
            if (!hasConsent("analytics")) ph.opt_out_capturing();
          } catch {}
        },
        session_recording: { maskAllInputs: true },
        opt_out_capturing_by_default: false,
        respect_dnt: true,
        disable_session_recording: !cfg.sessionRecording,
      });
      clientInstance = posthog;
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
