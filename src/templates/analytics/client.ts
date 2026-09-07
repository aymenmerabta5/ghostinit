import type { ProjectMode } from "../../lib/addons.js";

export function clientPosthogClientContent(mode: ProjectMode): string {
  const envImport =
    mode === "monorepo"
      ? 'import { getAnalyticsConfig, isAnalyticsEnabled } from "./config.js";\n'
      : 'import { getAnalyticsConfig, isAnalyticsEnabled } from "./config.js";\nimport { hasConsent } from "./shared/consent.js";\n';
  const consentImport =
    mode === "monorepo" ? 'import { hasConsent } from "../shared/consent.js";\n' : "";
  return `"use client";

import posthog, { type PostHogConfig, type PostHogInterface } from "posthog-js";
${envImport}${consentImport}
declare global {
  interface Window {
    posthog?: PostHogInterface;
  }
}

let clientInstance: PostHogInterface | null = null;
let initPromise: Promise<PostHogInterface | null> | null = null;
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

export function getPostHogClient(): PostHogInterface | null {
  if (!canUseWindow()) return null;
  return clientInstance;
}

export async function initPostHogClient(options?: {
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
  personProperties?: Record<string, unknown>;
}): Promise<PostHogInterface | null> {
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
        persistence: cfg.persistence as PostHogConfig["persistence"],
        person_profiles: cfg.personProfiles as PostHogConfig["person_profiles"],
        loaded: (ph) => {
          if (!canUseWindow()) return;
          try {
            window.posthog = ph;
            if (!hasConsent("analytics")) ph.opt_out_capturing();
          } catch {}
        },
        // posthog-js types featureFlagPayloads as JSON values; our public option is
        // Record<string, unknown>, so assert to the SDK's own BootstrapConfig shape
        // rather than leaking a structurally-incompatible literal (TS2322).
        bootstrap: options?.bootstrapFlags
          ? ({
              distinctID: "bootstrap",
              featureFlags: options.bootstrapFlags,
              featureFlagPayloads: options.bootstrapPayloads,
            } as PostHogConfig["bootstrap"])
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

      clientInstance = posthog;
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
