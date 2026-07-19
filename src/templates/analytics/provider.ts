import type { ProjectMode } from "../../lib/addons.js";

export function clientProviderContent(mode: ProjectMode): string {
  const configImport = mode === "monorepo" ? "../config.js" : "./config.js";
  const clientImport = mode === "monorepo" ? "./posthog-client.js" : "../lib/analytics.js";
  return `"use client";

/**
 * PostHogProvider — client component that bootstraps posthog-js.
 * Bootstrap via RootLayout server: getBootstrapFeatureFlags(distinctId).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PostHog } from "posthog-js";
import { getAnalyticsConfig, isAnalyticsEnabled } from "${configImport}";
import { getPostHogClient, initPostHogClient } from "${clientImport}";

export interface PostHogContextValue {
  client: PostHog | null;
  isLoaded: boolean;
  isEnabled: boolean;
  isIdentified: boolean;
}

export const PostHogContext = createContext<PostHogContextValue>({
  client: null,
  isLoaded: false,
  isEnabled: false,
  isIdentified: false,
});

export function usePostHogContext(): PostHogContextValue {
  return useContext(PostHogContext);
}

export interface PostHogProviderProps {
  children: React.ReactNode;
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
  personProperties?: Record<string, unknown>;
  distinctId?: string;
  initialOptedOut?: boolean;
}

export function PostHogProvider({
  children,
  bootstrapFlags,
  bootstrapPayloads,
  personProperties,
  distinctId,
  initialOptedOut,
}: PostHogProviderProps) {
  const [client, setClient] = useState<PostHog | null>(() => getPostHogClient());
  const [isLoaded, setIsLoaded] = useState<boolean>(() => Boolean(getPostHogClient()));
  const [isIdentified, setIsIdentified] = useState<boolean>(false);
  const didInitRef = useRef(false);

  const cfg = useMemo(() => {
    try {
      return getAnalyticsConfig();
    } catch {
      return null;
    }
  }, []);

  const isEnabled = useMemo(() => {
    try {
      return isAnalyticsEnabled();
    } catch {
      return false;
    }
  }, []);

  const initialize = useCallback(async () => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!isEnabled) return;
    if (initialOptedOut) return;
    try {
      const ph = await initPostHogClient({
        bootstrapFlags,
        bootstrapPayloads,
        personProperties,
      });
      setClient(ph);
      setIsLoaded(Boolean(ph));
      if (ph && distinctId) {
        try {
          ph.identify(distinctId, personProperties);
          setIsIdentified(true);
        } catch {}
      }
    } catch (err) {
      console.warn("[analytics] PostHogProvider init failed", err);
    }
  }, [bootstrapFlags, bootstrapPayloads, personProperties, distinctId, isEnabled, initialOptedOut]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!client || !distinctId) return;
    try {
      client.identify(distinctId, personProperties);
      setIsIdentified(true);
    } catch {}
  }, [client, distinctId, personProperties]);

  const value = useMemo<PostHogContextValue>(
    () => ({
      client,
      isLoaded,
      isEnabled: isEnabled && Boolean(cfg?.key),
      isIdentified,
    }),
    [client, isLoaded, isEnabled, cfg?.key, isIdentified],
  );

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
}

export default PostHogProvider;
`;
}

export function singleComponentsProviderContent(): string {
  return `"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PostHog } from "posthog-js";
import { getAnalyticsConfig, isAnalyticsEnabled, initPostHogClient, getPostHogClient } from "../../lib/analytics.js";
import type { FeatureFlagKey, ExperimentKey } from "../../server/analytics/types.js";

export interface PostHogContextValue {
  client: PostHog | null;
  isLoaded: boolean;
  isEnabled: boolean;
  isIdentified: boolean;
}

export const PostHogContext = createContext<PostHogContextValue>({
  client: null,
  isLoaded: false,
  isEnabled: false,
  isIdentified: false,
});
export function usePostHogContext(): PostHogContextValue {
  return useContext(PostHogContext);
}

export interface PostHogProviderProps {
  children: React.ReactNode;
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
  distinctId?: string;
}

export function PostHogProvider({ children, bootstrapFlags, bootstrapPayloads, distinctId }: PostHogProviderProps) {
  const [client, setClient] = useState<PostHog | null>(() => getPostHogClient());
  const [isLoaded, setIsLoaded] = useState(() => Boolean(getPostHogClient()));
  const didInitRef = useRef(false);
  const isEnabled = useMemo(() => {
    try {
      return isAnalyticsEnabled();
    } catch {
      return false;
    }
  }, []);

  const init = useCallback(async () => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!isEnabled) return;
    const ph = await initPostHogClient({ bootstrapFlags, bootstrapPayloads });
    setClient(ph);
    setIsLoaded(Boolean(ph));
    if (ph && distinctId) {
      try {
        ph.identify(distinctId);
      } catch {}
    }
  }, [bootstrapFlags, bootstrapPayloads, distinctId, isEnabled]);

  useEffect(() => {
    void init();
  }, [init]);

  const value = useMemo(
    () => ({
      client,
      isLoaded,
      isEnabled,
      isIdentified: Boolean(distinctId && isLoaded),
    }),
    [client, isLoaded, isEnabled, distinctId],
  );

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
}

export default PostHogProvider;

export function useFeatureFlag(key: FeatureFlagKey): string | boolean | undefined {
  const ctx = usePostHogContext();
  const [value, setValue] = useState<string | boolean | undefined>(undefined);
  useEffect(() => {
    if (!ctx.client) return;
    try {
      const v = (ctx.client as any).getFeatureFlag?.(key);
      setValue(v);
      const unsub = (ctx.client as any).onFeatureFlags?.((flags: Record<string, string | boolean>) => setValue(flags[key]));
      return () => {
        try {
          unsub?.();
        } catch {}
      };
    } catch {}
  }, [ctx.client, key]);
  return value;
}

export function useFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  const v = useFeatureFlag(key);
  if (typeof v === "boolean") return v;
  return v !== undefined;
}

export function useFeatureFlagPayload<T = unknown>(key: FeatureFlagKey): T | undefined {
  const ctx = usePostHogContext();
  const [payload, setPayload] = useState<T | undefined>(undefined);
  useEffect(() => {
    if (!ctx.client) return;
    try {
      const p = (ctx.client as any).getFeatureFlagPayload?.(key) as T | undefined;
      setPayload(p);
    } catch {}
  }, [ctx.client, key]);
  return payload;
}

function subscribe(cb: () => void) {
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
function getSnap(): Record<string, string | boolean> {
  try {
    return (window as any).posthog?.getFeatureFlags?.() ?? {};
  } catch {
    return {};
  }
}

export function useActiveFeatureFlags(): Record<string, string | boolean> {
  return useSyncExternalStore(subscribe, getSnap, () => ({}));
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
    return { variant, payload, isEnrolled: variant !== undefined, isLoading };
  }, [flag, payload, options?.fallback, isLoading]);
}

export function PostHogPageView() {
  return null;
}
`;
}
