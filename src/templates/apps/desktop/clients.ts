import { identityClientAdapterContent } from "../fragments/auth/client-adapter.js";
import { queryClientContent } from "../fragments/lib/query-client.js";
import type { DesktopMode } from "./model.js";
export function desktopQueryClientContent(): string {
  return queryClientContent();
}

export function desktopAuthContent(
  isConvex = false,
  _hasAdmin = true,
  mode: DesktopMode = "monorepo",
  hasEmail = true,
): string {
  const convexImport = isConvex
    ? `import { convexClient } from "@convex-dev/better-auth/client/plugins";`
    : "";
  const authPluginImport = `import { twoFactorClient${hasEmail ? ", magicLinkClient" : ""} } from "better-auth/client/plugins";`;
  const clientPlugins = [
    "twoFactorClient()",
    ...(hasEmail ? ["magicLinkClient()"] : []),
    ...(isConvex ? ["convexClient()"] : []),
  ].join(", ");
  return `import { createAuthClient } from "better-auth/react";
${authPluginImport}
${convexImport}
import { desktopBridgeFetch } from "../adapters/desktop-fetch";

function getAuthBaseUrl(): string {
  return window.desktopBridge.apiUrl;
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  plugins: [${clientPlugins}],
  fetchOptions: {
    credentials: "include",
    customFetchImpl: desktopBridgeFetch,
  },
});

function oauthAuthorizationUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const url = Reflect.get(value, "url");
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function desktopSignInWithOAuth(input: {
  provider: "google" | "github";
  callbackURL: string;
}) {
  const callbackURL = new URL("/desktop-auth-complete", getAuthBaseUrl()).toString();
  const result = await authClient.signIn.social({
    provider: input.provider,
    callbackURL,
    disableRedirect: true,
  });
  if (result.error) return result;
  const authorizationURL = oauthAuthorizationUrl(result.data);
  if (!authorizationURL) {
    return {
      data: null,
      error: {
        code: "OAUTH_AUTHORIZATION_URL_MISSING",
        message: "OAuth sign-in could not be started",
        status: 502,
        statusText: "Bad Gateway",
      },
    };
  }
  try {
    await window.desktopBridge.authStartOAuth({ authorizationURL, callbackURL });
  } catch {
    return {
      data: null,
      error: {
        code: "OAUTH_WINDOW_FAILED",
        message: "OAuth sign-in could not be completed",
        status: 400,
        statusText: "Bad Request",
      },
    };
  }
  return authClient.getSession();
}

${identityClientAdapterContent({
  database: isConvex ? "convex" : "postgres",
  emailPassword: hasEmail,
  oauthMode: "desktop",
  target: "electron",
})}
`;
}

export function desktopAuthStubContent(): string {
  return `// Auth is intentionally disabled for this generated configuration.
export const authDisabled = true as const;
`;
}

export function desktopUseAuthStubContent(): string {
  return `const disabledAuthState = {
  session: null,
  user: null,
  isPending: false,
  isAuthenticated: false,
  error: null,
  refetch: async () => undefined,
} as const;

export function useAuth() {
  return disabledAuthState;
}

export function useSession() {
  return disabledAuthState;
}
`;
}
