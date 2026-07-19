import type { ProjectMode } from "../../lib/addons.js";

export function clientPosthogClientContent(mode: ProjectMode): string {
  const envImport =
    mode === "monorepo"
      ? 'import { getAnalyticsConfig, isAnalyticsEnabled } from "../config.js";\n'
      : 'import { getAnalyticsConfig, isAnalyticsEnabled } from "./config.js";\nimport { hasConsent } from "./shared/consent.js";\n';
  const consentImport =
    mode === "monorepo" ? 'import { hasConsent } from "../shared/consent.js";\n' : "";
  return `"use client";

import posthog, { type PostHog } from "posthog-js";
${envImport}${consentImport}
let clientInstance: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;
let didWarnDisabled = false;

function canUseWindow(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getConfigSafe() {
  try {
    return getAnalyticsConfig();
  } catch {
    return null;
  }
}

export function getPostHogClient(): PostHog | null {
  if (!canUseWindow()) return null;
  return clientInstance;
}

export async function initPostHogClient(options?: {
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
  personProperties?: Record<string, unknown>;
}): Promise<PostHog | null> {
  if (!canUseWindow()) return null;
  if (clientInstance) return clientInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!isAnalyticsEnabled()) {
        if (!didWarnDisabled) {
          didWarnDisabled = true;
          console.debug("[analytics] PostHog disabled");
        }
        return null;
      }
      const cfg = getConfigSafe();
      if (!cfg || !cfg.key) return null;

      posthog.init(cfg.key, {
        api_host: cfg.apiEndpoint,
        ui_host: cfg.host,
        autocapture: cfg.autocapture,
        capture_pageview: cfg.capturePageview,
        capture_pageleave: cfg.capturePageleave,
        persistence: cfg.persistence as any,
        person_profiles: cfg.personProfiles as any,
        loaded: (ph) => {
          if (!canUseWindow()) return;
          try {
            (window as any).posthog = ph;
            if (!hasConsent("analytics")) ph.opt_out_capturing();
          } catch {}
        },
        bootstrap: options?.bootstrapFlags
          ? {
              distinctID: "bootstrap",
              featureFlags: options.bootstrapFlags,
              featureFlagPayloads: options.bootstrapPayloads,
            }
          : undefined,
        session_recording: { maskAllInputs: true, maskTextSelector: "[data-ph-no-capture]" },
        opt_out_capturing_by_default: false,
        respect_dnt: true,
        disable_session_recording: !cfg.sessionRecording,
      });

      if (options?.personProperties) {
        try {
          posthog.register(options.personProperties);
        } catch {}
      }

      clientInstance = posthog as unknown as PostHog;
      return clientInstance;
    } catch (err) {
      console.warn("[analytics] Failed to init posthog-js", err);
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
