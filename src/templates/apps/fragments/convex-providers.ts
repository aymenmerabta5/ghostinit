/**
 * Convex providers fragments — deduplicated Convex client provider for Next.js and TanStack Start.
 * Provides ConvexReactClient + ConvexProviderWithAuth through a validated
 * Better Auth token bridge. This avoids the upstream provider's over-broad
 * AuthClient union while retaining the same public Convex authentication hook.
 * Used when --database convex is selected.
 */

import { providersFileContent } from "./theme.js";

export type RouterType = "next" | "tanstack";

export function convexAuthBridgeContent(): string {
  return `interface ConvexAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
}

function betterAuthSessionId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const session = Reflect.get(value, "session");
  if (typeof session !== "object" || session === null) return null;
  const id = Reflect.get(session, "id");
  return typeof id === "string" && id.length > 0 ? id : null;
}

function convexAccessToken(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const data = Reflect.get(value, "data");
  if (typeof data !== "object" || data === null) return null;
  const token = Reflect.get(data, "token");
  return typeof token === "string" && token.length > 0 ? token : null;
}

function useConvexBetterAuth(): ConvexAuthState {
  const session = authClient.useSession();
  const sessionId = betterAuthSessionId(session.data);
  const fetchAccessToken = React.useCallback(async (): Promise<string | null> => {
    const result = await authClient.convex.token({ fetchOptions: { throw: false } });
    return convexAccessToken(result);
  }, [sessionId]);
  return React.useMemo(
    () => ({
      isLoading: session.isPending,
      isAuthenticated: sessionId !== null,
      fetchAccessToken,
    }),
    [fetchAccessToken, session.isPending, sessionId],
  );
}`;
}

export function convexClientProviderContent(router: RouterType = "next", hasAuth = true): string {
  const configImport = router === "tanstack" ? "@repo/config/vite" : "@repo/config/next";
  const convexKey = router === "tanstack" ? "VITE_CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL";
  const convexImport = hasAuth
    ? `import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";`
    : `import { ConvexProvider, ConvexReactClient } from "convex/react";`;
  const authImport = hasAuth ? `import { authClient } from "@/lib/auth-client";` : "";
  const providerOpen = hasAuth
    ? `<ConvexProviderWithAuth client={convexClient} useAuth={useConvexBetterAuth}>`
    : `<ConvexProvider client={convexClient}>`;
  const providerClose = hasAuth ? `</ConvexProviderWithAuth>` : `</ConvexProvider>`;
  const authBridge = hasAuth ? convexAuthBridgeContent() : "";
  return `"use client";

import * as React from "react";
${convexImport}
${authImport}
import { env } from "${configImport}";

const convexUrl = env.${convexKey};

if (!convexUrl) {
  throw new Error("${convexKey} is not set. Run \`bunx convex dev\` and update the app environment.");
}

export const convexClient = new ConvexReactClient(convexUrl);

${authBridge}

/**
 * ConvexClientProvider — standalone provider that can be composed inside app Providers.
 * Bridges Better Auth session/token state through Convex's public custom-auth contract.
 * Use in apps/web/src/components/providers.tsx when convex inUse.
 */
export function ConvexClientProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    ${providerOpen}
      {children}
    ${providerClose}
  );
}
`;
}

export function convexClientProviderExpoContent(
  hasAuth = true,
  mode: "monorepo" | "single" = "monorepo",
): string {
  const convexImport = hasAuth
    ? 'import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";'
    : 'import { ConvexProvider, ConvexReactClient } from "convex/react";';
  const authImport = hasAuth ? 'import { authClient } from "@/lib/auth-client";\n' : "";
  const providerOpen = hasAuth
    ? "<ConvexProviderWithAuth client={convexClient} useAuth={useConvexBetterAuth}>"
    : "<ConvexProvider client={convexClient}>";
  const providerClose = hasAuth ? "</ConvexProviderWithAuth>" : "</ConvexProvider>";
  const authBridge = hasAuth ? convexAuthBridgeContent() : "";
  return `
import * as React from "react";
${convexImport}
${authImport}
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";
function getConvexUrl(): string {
  const url = env.EXPO_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_CONVEX_URL is not set. Run \`bunx convex dev\` and expose the generated URL to Expo.",
    );
  }
  return url;
}

export const convexClient = new ConvexReactClient(getConvexUrl());

${authBridge}

export function ConvexClientProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    ${providerOpen}
      {children}
    ${providerClose}
  );
}
`;
}

export function providersFileContentConvex(
  router: RouterType = "next",
  hasAnalytics = true,
): string {
  return providersFileContent(router, true, hasAnalytics);
}
