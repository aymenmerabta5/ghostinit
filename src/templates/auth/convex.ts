/**
 * Auth package convex variants
 * Provides client with convexClient plugin and server helpers using convexBetterAuthNextJs
 */

export function authClientConvexContent(): string {
  return `import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    convexClient(),
    twoFactorClient({
      onTwoFactorRedirect(context) {
        if (context.twoFactorMethods?.includes("totp") && typeof window !== "undefined") {
          window.location.href = "/2fa";
        }
      },
    }),
    adminClient(),
  ],
});
`;
}

export function authServerConvexNextContent(): string {
  return `import { ConvexHttpClient } from "convex/browser";
import { env } from "@repo/config";

function resolveConvexUrl(): string {
  const url =
    process.env.CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    env.CONVEX_URL ??
    env.NEXT_PUBLIC_CONVEX_URL;
  if (!url || url.startsWith("REPLACE_WITH")) {
    throw new Error("CONVEX_URL / NEXT_PUBLIC_CONVEX_URL must be set for convex auth mode");
  }
  return url;
}

const convexUrl = resolveConvexUrl();
export const convexClient = new ConvexHttpClient(convexUrl);

// Validation — same as convex/auth.ts but for Next.js layer
if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32 || env.BETTER_AUTH_SECRET.startsWith("REPLACE_WITH")) {
  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value at least 32 chars");
}

const siteUrl =
  env.SITE_URL ??
  env.CONVEX_SITE_URL ??
  env.NEXT_PUBLIC_APP_URL ??
  env.BETTER_AUTH_URL;

if (!siteUrl || siteUrl.includes("example.com")) {
  throw new Error("SITE_URL or CONVEX_SITE_URL is required and must not be placeholder https://example.com");
}

export const auth = {
  // In convex mode, auth instance lives in Convex runtime.
  // Next.js handler proxies via convex http routes registered in convex/http.ts
  // Use convexClient to call api.auth.* or api.users.me etc.
  convexUrl,
  siteUrl,
  // Stub for compatibility — real auth logic in convex/auth.ts
  handler: async (req: Request) => {
    // Forward to CONVEX_SITE_URL auth routes if needed, or rely on ConvexBetterAuthProvider
    return new Response(JSON.stringify({ message: "Auth handled via Convex CONVEX_SITE_URL — use ConvexBetterAuthProvider" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};

export type Auth = typeof auth;
`;
}

export function authServerConvexTanstackContent(): string {
  return `import { ConvexHttpClient } from "convex/browser";
import { env } from "@repo/config";

function resolveConvexUrl(): string {
  const url =
    (process.env.VITE_CONVEX_URL as string | undefined) ??
    (typeof process !== "undefined" && (process as unknown as { env?: Record<string, string | undefined> }).env?.VITE_CONVEX_URL) ??
    process.env.CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url || (typeof url === "string" && url.startsWith("REPLACE_WITH"))) {
    throw new Error("VITE_CONVEX_URL / CONVEX_URL must be set for convex tanstack mode");
  }
  return url as string;
}

const convexUrl = resolveConvexUrl();
export const convexClient = new ConvexHttpClient(convexUrl);

if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 chars");
}

export const auth = {
  convexUrl,
  siteUrl: env.SITE_URL ?? env.CONVEX_SITE_URL ?? "http://localhost:3000",
  handler: async (req: Request) => {
    return new Response(JSON.stringify({ message: "Auth via Convex" }), { status: 200, headers: { "Content-Type": "application/json" } });
  },
};

export type Auth = typeof auth;
`;
}

import * as v from "../versions.js";

export function convexAuthPackageJsonDeps(): Record<string, string> {
  // Used by authPackage to inject deps
  return {
    convex: `^${v.convex.convex}`,
    "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
  };
}
