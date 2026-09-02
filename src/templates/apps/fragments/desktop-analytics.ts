import { file, type TemplateFile } from "../../shared.js";

export function desktopAnalyticsContent(mode: "monorepo" | "single" = "monorepo"): string {
  const configImport = mode === "monorepo" ? "@repo/config/vite" : "@/lib/env/vite";
  return `import * as React from "react";
import { useRouterState } from "@tanstack/react-router";
import posthog, { type PostHogInterface } from "posthog-js";
import { env } from "${configImport}";

export type DesktopAnalyticsPrimitive = string | number | boolean | null;
export type DesktopAnalyticsProperties = Record<string, DesktopAnalyticsPrimitive>;

export interface DesktopAnalyticsAdapter {
  readonly enabled: boolean;
  capture(event: string, properties?: DesktopAnalyticsProperties): void;
  identify(distinctId: string, properties?: DesktopAnalyticsProperties): void;
  reset(): void;
  optIn(): void;
  optOut(): void;
}

const EVENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9 ._/-]{0,127}$/;
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

function validProperties(properties?: DesktopAnalyticsProperties): boolean {
  if (!properties) return true;
  return Object.keys(properties).length <= 50;
}

function analyticsHost(): string | null {
  const configured = env.VITE_POSTHOG_HOST;
  const base = env.VITE_API_URL ?? env.VITE_APP_URL;
  try {
    const parsed = new URL(configured?.startsWith("/") ? configured : configured ?? DEFAULT_POSTHOG_HOST, base);
    const localHttp = parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.protocol !== "https:" && !localHttp) return null;
    return (parsed.origin + parsed.pathname).replace(/\\/+$/, "");
  } catch {
    return null;
  }
}

const apiKey = env.VITE_POSTHOG_KEY;
const host = analyticsHost();
const configured =
  env.VITE_ANALYTICS_DISABLED !== "true" &&
  apiKey.length >= 10 &&
  !apiKey.includes("REPLACE") &&
  !apiKey.toLowerCase().includes("placeholder") &&
  host !== null;
let initialized = false;

function initialize(initiallyOptedOut: boolean): boolean {
  if (!configured) return false;
  if (initialized) return true;
  try {
    posthog.init(apiKey, {
      api_host: host ?? DEFAULT_POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: "localStorage",
      respect_dnt: true,
      opt_out_capturing_by_default: initiallyOptedOut,
    });
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

const disabledAdapter: DesktopAnalyticsAdapter = Object.freeze({
  enabled: false,
  capture: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  optIn: () => undefined,
  optOut: () => undefined,
});
const AnalyticsContext = React.createContext<DesktopAnalyticsAdapter>(disabledAdapter);

export function DesktopAnalyticsProvider({
  children,
  initiallyOptedOut = false,
}: {
  children: React.ReactNode;
  initiallyOptedOut?: boolean;
}): React.JSX.Element {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [enabled, setEnabled] = React.useState(false);
  const previousPath = React.useRef<string | null>(null);

  React.useEffect(() => {
    setEnabled(initialize(initiallyOptedOut));
  }, [initiallyOptedOut]);

  React.useEffect(() => {
    if (!enabled || previousPath.current === pathname) return;
    previousPath.current = pathname;
    posthog.capture("$screen", { $screen_name: pathname });
  }, [enabled, pathname]);

  const adapter = React.useMemo<DesktopAnalyticsAdapter>(() => {
    if (!enabled) return disabledAdapter;
    const client: PostHogInterface = posthog;
    return {
      enabled: true,
      capture(event, properties) {
        if (!EVENT_NAME.test(event) || !validProperties(properties)) return;
        client.capture(event, properties);
      },
      identify(distinctId, properties) {
        if (!distinctId || distinctId.length > 256 || !validProperties(properties)) return;
        client.identify(distinctId, properties);
      },
      reset: () => client.reset(),
      optIn: () => client.opt_in_capturing(),
      optOut: () => client.opt_out_capturing(),
    };
  }, [enabled]);

  return <AnalyticsContext.Provider value={adapter}>{children}</AnalyticsContext.Provider>;
}

export function useDesktopAnalytics(): DesktopAnalyticsAdapter {
  return React.useContext(AnalyticsContext);
}
`;
}

export function desktopAnalyticsFile(mode: "monorepo" | "single"): TemplateFile {
  return file(
    mode === "monorepo"
      ? "apps/desktop/src/renderer/lib/analytics.tsx"
      : "src/renderer/lib/analytics.tsx",
    desktopAnalyticsContent(mode),
  );
}
