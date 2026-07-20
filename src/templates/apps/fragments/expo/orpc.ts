/**
 * Expo oRPC client + auth client fragments
 * Typed, no any, RNR + Uniwind compatible
 */

function sanitizeSchemeInternal(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
}

export function expoAuthClientContent(projectName = "__PROJECT_NAME__"): string {
  const isPlaceholder = projectName === "__PROJECT_NAME__";
  const scheme = isPlaceholder ? "myapp" : sanitizeSchemeInternal(projectName);
  return `import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_APP_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EXPO_PUBLIC_API_URL must be set in production");
    }
    return "http://localhost:3000";
  }
  return url;
}

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    expoClient({
      scheme: "${scheme}",
      storagePrefix: "${projectName}",
      storage: SecureStore,
    }),
  ],
});
`;
}

export function expoOrpcClientContent(): string {
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";
import { authClient } from "./auth-client";

function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_APP_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EXPO_PUBLIC_API_URL must be set in production");
    }
    return "http://localhost:3000";
  }
  return url;
}

type AuthClientWithCookie = typeof authClient & { getCookie?: () => string | undefined };

const link = new RPCLink({
  url: \`\${getBaseUrl()}/api\`,
  headers: async () => {
    const ac = authClient as AuthClientWithCookie;
    const cookie = ac.getCookie?.();
    return cookie ? ({ cookie } as Record<string, string>) : ({} as Record<string, string>);
  },
});

export const orpc: RouterClient<typeof appRouter> = createORPCClient(link);

export function createApiClient() {
  return orpc;
}
export type ApiClient = typeof orpc;
`;
}
