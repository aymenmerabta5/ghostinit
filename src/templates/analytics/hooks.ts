import { featureFlagHooksContent } from "./flag-hooks.js";
import type { ProjectMode } from "../../lib/addons.js";

export function clientHooksContent(mode: ProjectMode): string {
  const clientImport = mode === "monorepo" ? "./posthog-client.js" : "../lib/analytics.js";
  const contextImport = mode === "monorepo" ? "./provider.js" : "./posthog-provider.js";
  return `"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { JsonType, PostHogInterface } from "posthog-js";
import { usePostHogContext } from "${contextImport}";
import { captureClientEvent } from "${clientImport}";
import type { AnalyticsEventName, EventProperties, ExperimentKey, FeatureFlagKey } from "${mode === "monorepo" ? "../types.js" : "../server/analytics/types.js"}";

export function usePostHog() {
  const ctx = usePostHogContext();
  return ctx.client;
}

export function useAnalytics() {
  const ctx = usePostHogContext();
  const capture = useCallback(
    (event: AnalyticsEventName, properties?: EventProperties) => {
      captureClientEvent(event, properties as Record<string, unknown>);
    },
    [],
  );

  const identify = useCallback(
    (distinctId: string, traits?: Record<string, unknown>) => {
      try {
        ctx.client?.identify(distinctId, traits);
      } catch {}
    },
    [ctx.client],
  );

  const alias = useCallback(
    (aliasId: string) => {
      try {
        ctx.client?.alias(aliasId);
      } catch {}
    },
    [ctx.client],
  );

  const reset = useCallback(() => {
    try {
      ctx.client?.reset();
    } catch {}
  }, [ctx.client]);

  return {
    client: ctx.client,
    isLoaded: ctx.isLoaded,
    isEnabled: ctx.isEnabled,
    capture,
    identify,
    alias,
    reset,
  };
}

${featureFlagHooksContent("usePostHog()")}

export function useFeatureFlags(): Record<string, string | boolean> {
  return useActiveFeatureFlags();
}

export interface UseExperimentResult {
  variant: string | undefined;
  payload: JsonType | undefined;
  isEnrolled: boolean;
  isLoading: boolean;
}

export function useExperiment(key: ExperimentKey, options?: { fallback?: string }): UseExperimentResult {
  const flag = useFeatureFlag(key);
  const payload = useFeatureFlagPayload(key);
  const isLoading = flag === undefined;

  return useMemo(() => {
    const variant = typeof flag === "string" ? flag : flag === true ? "control" : options?.fallback;
    return {
      variant,
      payload,
      isEnrolled: variant !== undefined,
      isLoading,
    };
  }, [flag, payload, options?.fallback, isLoading]);
}

export function useFeatureFlagVariant(key: FeatureFlagKey): string | undefined {
  const flag = useFeatureFlag(key);
  return typeof flag === "string" ? flag : undefined;
}
`;
}

export function singleHooksContent(): string {
  return `"use client";

import { useCallback } from "react";
import { captureClientEvent, getPostHogClient, identifyClientUser } from "../lib/analytics.js";
import { usePostHogContext } from "../components/analytics/posthog-provider.js";
import type { AnalyticsEventName, EventProperties } from "../server/analytics/types.js";

export function useAnalytics() {
  const ctx = usePostHogContext();
  const capture = useCallback((event: AnalyticsEventName, properties?: EventProperties) => {
    captureClientEvent(event, properties as Record<string, unknown>);
  }, []);
  const identify = useCallback(
    (id: string, traits?: Record<string, unknown>) => {
      identifyClientUser(id, traits);
      try {
        ctx.client?.identify(id, traits);
      } catch {}
    },
    [ctx.client],
  );
  return { capture, identify, client: ctx.client, isLoaded: ctx.isLoaded, isEnabled: ctx.isEnabled };
}

export function usePostHog() {
  return getPostHogClient();
}

export { useFeatureFlag, useFeatureFlagEnabled, useFeatureFlagPayload, useExperiment, useActiveFeatureFlags } from "../components/analytics/posthog-provider.js";
`;
}
