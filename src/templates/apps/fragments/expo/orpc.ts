/**
 * Expo oRPC client + auth client fragments
 * Typed, no any, RNR + Uniwind compatible
 */
import { identityClientAdapterContent } from "../auth/client-adapter.js";

function sanitizeSchemeInternal(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
}

export function expoAuthClientContent(
  projectName = "__PROJECT_NAME__",
  isConvex = false,
  mode: "monorepo" | "single" = "monorepo",
  hasEmail = true,
): string {
  const isPlaceholder = projectName === "__PROJECT_NAME__";
  const scheme = isPlaceholder ? "myapp" : sanitizeSchemeInternal(projectName);
  return `import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
${isConvex ? 'import { convexClient } from "@convex-dev/better-auth/client/plugins";\n' : ""}import * as SecureStore from "expo-secure-store";
import { ${isConvex ? "twoFactorClient" : "adminClient, twoFactorClient"}${hasEmail ? ", magicLinkClient" : ""} } from "better-auth/client/plugins";
import { z } from "zod";
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";

function getBaseUrl(): string {
  for (const value of [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password) {
        return parsed.toString().replace(/\\/$/, "");
      }
    } catch {}
  }
  throw new Error("EXPO_PUBLIC_API_URL must be a trusted HTTP(S) API URL");
}

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    ${isConvex ? "convexClient(),\n    " : ""}twoFactorClient(),
    ${hasEmail ? "magicLinkClient(),\n    " : ""}
    ${isConvex ? "" : "adminClient(),\n    "}expoClient({
      scheme: "${scheme}",
      storagePrefix: "${projectName}",
      storage: SecureStore,
    }),
  ],
});

${identityClientAdapterContent({
  database: isConvex ? "convex" : "postgres",
  emailPassword: hasEmail,
  target: "expo",
})}
`;
}

export interface ExpoOrpcClientOptions {
  routerImport?: string;
  rpcPath?: string;
  hasAuth?: boolean;
  mode?: "monorepo" | "single";
}

export function expoOrpcClientContent(options: ExpoOrpcClientOptions = {}): string {
  const routerImport = options.routerImport ?? "@repo/api";
  const rpcPath = options.rpcPath ?? "/api/rpc";
  const hasAuth = options.hasAuth ?? true;
  const mode = options.mode ?? "monorepo";
  const authImport = hasAuth ? 'import { authClient } from "./auth-client";\n' : "";
  const platformImport = hasAuth ? 'import { Platform } from "react-native";\n' : "";
  const authHeaders = hasAuth
    ? `,
  headers: async (): Promise<Record<string, string>> => {
    if (Platform.OS === "web") return {};
    const cookie = authClient.getCookie();
    // Non-simple CSRF signal only; the Better Auth cookie still supplies identity.
    const headers: Record<string, string> = { "x-ghostinit-native-client": "expo" };
    if (cookie) headers.cookie = cookie;
    return headers;
  }`
    : "";
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import type { RouterClient } from "@orpc/server";
${platformImport}import type { appRouter } from "${routerImport}";
${authImport}
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";

function getBaseUrl(): string {
  for (const value of [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password) {
        return parsed.toString().replace(/\\/$/, "");
      }
    } catch {}
  }
  throw new Error("EXPO_PUBLIC_API_URL must be a trusted HTTP(S) API URL");
}

const link = new RPCLink({
  url: \`\${getBaseUrl()}${rpcPath}\`${authHeaders},
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const orpcClient: RouterClient<typeof appRouter> = createORPCClient(link);
export const orpc = createORPCReactQueryUtils(orpcClient);

export function createApiClient() {
  return orpcClient;
}
export type ApiClient = typeof orpcClient;
`;
}
