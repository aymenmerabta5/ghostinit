/**
 * Expo oRPC client + auth client fragments
 * Typed, no any, RNR + Uniwind compatible
 */

export function expoAuthClientContent(): string {
  return `import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [
    expoClient({
      scheme: "__PROJECT_NAME__",
      storagePrefix: "__PROJECT_NAME__",
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
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (process.env.EXPO_PUBLIC_APP_URL) return process.env.EXPO_PUBLIC_APP_URL;
  return "http://localhost:3000";
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
