import type { ProjectMode } from "../../lib/addons.js";

export function clientHooksContent(mode: ProjectMode): string {
  const clientImport = mode === "monorepo" ? "./posthog-client.js" : "../lib/analytics.js";
  const contextImport = mode === "monorepo" ? "./provider.js" : "./posthog-provider.js";
  return `"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePostHogContext } from "${contextImport}";
import { captureClientEvent, getPostHogClient } from "${clientImport}";
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
        (ctx.client as any)?.alias?.(aliasId);
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

export function useFeatureFlag(key: FeatureFlagKey): string | boolean | undefined {
  const client = usePostHog();
  const [value, setValue] = useState<string | boolean | undefined>(undefined);

  useEffect(() => {
    if (!client) return;
    try {
      const v = (client as any).getFeatureFlag?.(key);
      setValue(v);
      const unsub = (client as any).onFeatureFlags?.((flags: Record<string, string | boolean>) => {
        setValue(flags[key]);
      });
      return () => {
        try {
          unsub?.();
        } catch {}
      };
    } catch {
      return;
    }
  }, [client, key]);

  return value;
}

export function useFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  const flag = useFeatureFlag(key);
  if (typeof flag === "boolean") return flag;
  return flag !== undefined;
}

export function useFeatureFlagPayload<T = unknown>(key: FeatureFlagKey): T | undefined {
  const client = usePostHog();
  const [payload, setPayload] = useState<T | undefined>(undefined);

  useEffect(() => {
    if (!client) return;
    try {
      const p = (client as any).getFeatureFlagPayload?.(key) as T | undefined;
      setPayload(p);
    } catch {}
  }, [client, key]);

  return payload;
}

function subscribeToFlags(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  try {
    const ph = (window as any).posthog;
    if (!ph?.onFeatureFlags) return () => {};
    const unsub = ph.onFeatureFlags(cb);
    return () => {
      try {
        unsub?.();
      } catch {}
    };
  } catch {
    return () => {};
  }
}

function getFlagsSnapshot(): Record<string, string | boolean> {
  try {
    const ph = typeof window !== "undefined" ? (window as any).posthog : null;
    return ph?.getFeatureFlags?.() ?? {};
  } catch {
    return {};
  }
}

function getFlagsServerSnapshot(): Record<string, string | boolean> {
  return {};
}

export function useActiveFeatureFlags(): Record<string, string | boolean> {
  return useSyncExternalStore(subscribeToFlags, getFlagsSnapshot, getFlagsServerSnapshot);
}

export function useFeatureFlags(): Record<string, string | boolean> {
  return useActiveFeatureFlags();
}

export interface UseExperimentResult {
  variant: string | undefined;
  payload: unknown;
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
