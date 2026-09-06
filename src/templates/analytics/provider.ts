import type { ProjectMode } from "../../lib/addons.js";

/** Shared client context, emitted beside each mode-specific provider. */
export function postHogContextContent(): string {
  return `"use client";

import { createContext, useContext } from "react";
import type { PostHogInterface } from "posthog-js";

export interface PostHogContextValue {
  client: PostHogInterface | null;
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
`;
}

export function clientProviderContent(mode: ProjectMode): string {
  const configImport = "./config.js";
  const clientImport = mode === "monorepo" ? "./posthog-client.js" : "../lib/analytics.js";
  return `"use client";

/**
 * PostHogProvider — client component that bootstraps posthog-js.
 * Bootstrap via RootLayout server: getBootstrapFeatureFlags(distinctId).
 */

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PostHogInterface } from "posthog-js";
import { getAnalyticsConfig, isAnalyticsEnabled } from "${configImport}";
import { getPostHogClient, initPostHogClient } from "${clientImport}";
import { PostHogContext } from "./context.js";
import type { PostHogContextValue } from "./context.js";

export { PostHogContext, usePostHogContext } from "./context.js";
export type { PostHogContextValue } from "./context.js";

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
  const [client, setClient] = useState<PostHogInterface | null>(() => getPostHogClient());
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
    if (!isEnabled || initialOptedOut) return;
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
    () => ({ client, isLoaded, isEnabled: isEnabled && Boolean(cfg?.key), isIdentified }),
    [client, isLoaded, isEnabled, cfg?.key, isIdentified],
  );

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
}

export default PostHogProvider;
`;
}

/** Single-mode provider entry point. Feature-flag hooks live in a focused sibling module. */
export function singleComponentsProviderContent(): string {
  return `"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PostHogInterface } from "posthog-js";
import { getPostHogClient, initPostHogClient, isAnalyticsEnabled } from "../../lib/analytics.js";
import { PostHogContext } from "./posthog-context.js";
import type { PostHogContextValue } from "./posthog-context.js";

export { PostHogContext, usePostHogContext } from "./posthog-context.js";
export type { PostHogContextValue } from "./posthog-context.js";
export {
  PostHogPageView,
  useActiveFeatureFlags,
  useExperiment,
  useFeatureFlag,
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
} from "./posthog-hooks.js";
export type { UseExperimentResult } from "./posthog-hooks.js";

export interface PostHogProviderProps {
  children: React.ReactNode;
  bootstrapFlags?: Record<string, string | boolean>;
  bootstrapPayloads?: Record<string, unknown>;
  distinctId?: string;
}

export function PostHogProvider({
  children,
  bootstrapFlags,
  bootstrapPayloads,
  distinctId,
}: PostHogProviderProps) {
  const [client, setClient] = useState<PostHogInterface | null>(() => getPostHogClient());
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

  const value = useMemo<PostHogContextValue>(
    () => ({ client, isLoaded, isEnabled, isIdentified: Boolean(distinctId && isLoaded) }),
    [client, isLoaded, isEnabled, distinctId],
  );

  return <PostHogContext.Provider value={value}>{children}</PostHogContext.Provider>;
}

export default PostHogProvider;
`;
}

/** Single-mode flag and experiment hooks, kept separate so the provider stays bounded. */
export function singleComponentsHooksContent(): string {
  return `"use client";

import { useEffect, useMemo, useState } from "react";
import type { JsonType } from "posthog-js";
import type { FeatureFlagKey, ExperimentKey } from "../../server/analytics/types.js";
import { usePostHogContext } from "./posthog-context.js";

export function useFeatureFlag(key: FeatureFlagKey): string | boolean | undefined {
  const ctx = usePostHogContext();
  const [value, setValue] = useState<string | boolean | undefined>(undefined);
  useEffect(() => {
    if (!ctx.client) return;
    try {
      setValue(ctx.client.getFeatureFlag(key));
      const unsubscribe = ctx.client.onFeatureFlags((_flagKeys, variants) => setValue(variants[key]));
      return () => {
        try {
          unsubscribe?.();
        } catch {}
      };
    } catch {}
  }, [ctx.client, key]);
  return value;
}

export function useFeatureFlagEnabled(key: FeatureFlagKey): boolean {
  const value = useFeatureFlag(key);
  return typeof value === "boolean" ? value : value !== undefined;
}

export function useFeatureFlagPayload(key: FeatureFlagKey): JsonType | undefined {
  const ctx = usePostHogContext();
  const [payload, setPayload] = useState<JsonType | undefined>(undefined);
  useEffect(() => {
    if (!ctx.client) return;
    try {
      setPayload(ctx.client.getFeatureFlagPayload(key));
    } catch {}
  }, [ctx.client, key]);
  return payload;
}

export function useActiveFeatureFlags(): Record<string, string | boolean> {
  const ctx = usePostHogContext();
  const [flags, setFlags] = useState<Record<string, string | boolean>>({});
  useEffect(() => {
    if (!ctx.client) return;
    try {
      const unsubscribe = ctx.client.onFeatureFlags((_flagKeys, variants) => setFlags(variants));
      return () => {
        try {
          unsubscribe();
        } catch {}
      };
    } catch {
      return;
    }
  }, [ctx.client]);
  return flags;
}

export interface UseExperimentResult {
  variant: string | undefined;
  payload: JsonType | undefined;
  isEnrolled: boolean;
  isLoading: boolean;
}

export function useExperiment(
  key: ExperimentKey,
  options?: { fallback?: string },
): UseExperimentResult {
  const flag = useFeatureFlag(key);
  const payload = useFeatureFlagPayload(key);
  const isLoading = flag === undefined;
  return useMemo(() => {
    const variant = typeof flag === "string" ? flag : flag === true ? "control" : options?.fallback;
    return { variant, payload, isEnrolled: variant !== undefined, isLoading };
  }, [flag, payload, options?.fallback, isLoading]);
}

export { PostHogPageView } from "./posthog-pageview.js";
`;
}
