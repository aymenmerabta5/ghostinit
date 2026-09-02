import { file, type TemplateFile } from "../../../shared.js";

export function expoAnalyticsContent(mode: "monorepo" | "single" = "monorepo"): string {
  const configImport = mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo";
  return `import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSegments } from "expo-router";
import PostHog, { PostHogProvider, usePostHog } from "posthog-react-native";
import { env } from "${configImport}";

export type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsPrimitive>;

export interface ExpoAnalyticsAdapter {
  readonly enabled: boolean;
  capture(event: string, properties?: AnalyticsProperties): void;
  identify(distinctId: string, properties?: AnalyticsProperties): void;
  reset(): void;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  flush(): Promise<void>;
}

export interface ExpoAnalyticsProviderProps {
  children: React.ReactNode;
  initiallyOptedOut?: boolean;
}

const EVENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9 ._/-]{0,127}$/;
const PROPERTY_NAME = /^[a-zA-Z0-9_$][a-zA-Z0-9_$.-]{0,63}$/;
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

function validProperties(value: AnalyticsProperties | undefined): boolean {
  if (!value) return true;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, item]) =>
    PROPERTY_NAME.test(key) &&
    (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean")
  );
}

function normalizeHost(value: string | undefined): string | null {
  if (!value || value.startsWith("/")) return DEFAULT_POSTHOG_HOST;
  try {
    const parsed = new URL(value);
    const isLocalHttp = parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.protocol !== "https:" && !isLocalHttp) return null;
    return (parsed.origin + parsed.pathname).replace(/\\/+$/, "");
  } catch {
    return null;
  }
}

export function resolveExpoAnalyticsConfig(): {
  enabled: boolean;
  apiKey: string;
  host: string;
} {
  const apiKey = env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
  const host = normalizeHost(env.EXPO_PUBLIC_POSTHOG_HOST);
  const enabled =
    env.EXPO_PUBLIC_ANALYTICS_DISABLED !== "true" &&
    apiKey.length >= 10 &&
    !apiKey.includes("REPLACE") &&
    !apiKey.toLowerCase().includes("placeholder") &&
    host !== null;
  return { enabled, apiKey, host: host ?? DEFAULT_POSTHOG_HOST };
}

const config = resolveExpoAnalyticsConfig();
let clientInstance: PostHog | null | undefined;

function getClient(initiallyOptedOut: boolean): PostHog | null {
  if (!config.enabled) return null;
  if (clientInstance !== undefined) return clientInstance;
  clientInstance = new PostHog(config.apiKey, {
    host: config.host,
    persistence: "file",
    customStorage: AsyncStorage,
    defaultOptIn: !initiallyOptedOut,
    captureAppLifecycleEvents: false,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    enableSessionReplay: false,
  });
  return clientInstance;
}

const disabledAdapter: ExpoAnalyticsAdapter = Object.freeze({
  enabled: false,
  capture: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  optIn: async () => undefined,
  optOut: async () => undefined,
  flush: async () => undefined,
});

const AnalyticsContext = React.createContext<ExpoAnalyticsAdapter>(disabledAdapter);

function ActiveAnalytics({ children }: { children: React.ReactNode }): React.JSX.Element {
  const posthog = usePostHog();
  const segments = useSegments();
  const routeKey = segments.join("/");
  const previousRoute = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    const screenName = routeKey ? "/" + routeKey : "/";
    void posthog.screen(screenName, { route_template: screenName }).catch(() => undefined);
  }, [posthog, routeKey]);

  const adapter = React.useMemo<ExpoAnalyticsAdapter>(() => ({
    enabled: true,
    capture(event, properties) {
      if (!EVENT_NAME.test(event) || !validProperties(properties)) return;
      void Promise.resolve(posthog.capture(event, properties)).catch(() => undefined);
    },
    identify(distinctId, properties) {
      if (!distinctId || distinctId.length > 256 || !validProperties(properties)) return;
      posthog.identify(distinctId, properties);
    },
    reset() {
      posthog.reset();
    },
    async optIn() {
      await posthog.optIn();
    },
    async optOut() {
      await posthog.optOut();
    },
    async flush() {
      await posthog.flush();
    },
  }), [posthog]);

  return <AnalyticsContext.Provider value={adapter}>{children}</AnalyticsContext.Provider>;
}

export function ExpoAnalyticsProvider({
  children,
  initiallyOptedOut = false,
}: ExpoAnalyticsProviderProps): React.JSX.Element {
  const client = getClient(initiallyOptedOut);
  if (!client) {
    return <AnalyticsContext.Provider value={disabledAdapter}>{children}</AnalyticsContext.Provider>;
  }
  return (
    <PostHogProvider client={client} autocapture={false} debug={false}>
      <ActiveAnalytics>{children}</ActiveAnalytics>
    </PostHogProvider>
  );
}

export function useExpoAnalytics(): ExpoAnalyticsAdapter {
  return React.useContext(AnalyticsContext);
}
`;
}

export function expoAnalyticsFile(mode: "monorepo" | "single" = "monorepo"): TemplateFile {
  return file(
    mode === "monorepo" ? "apps/mobile/src/lib/analytics.tsx" : "src/lib/analytics.tsx",
    expoAnalyticsContent(mode),
  );
}
