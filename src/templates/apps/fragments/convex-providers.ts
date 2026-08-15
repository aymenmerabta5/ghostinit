/**
 * Convex providers fragments — deduplicated Convex client provider for Next.js and TanStack Start.
 * Provides ConvexReactClient + ConvexBetterAuthProvider wrapping authClient.
 * Used when --database convex is selected.
 */

export type RouterType = "next" | "tanstack";

export function convexClientProviderContent(router: RouterType = "next"): string {
  const convexEnv =
    router === "tanstack"
      ? "process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.VITE_CONVEX_URL"
      : "process.env.NEXT_PUBLIC_CONVEX_URL";
  const convexKey =
    router === "tanstack" ? "NEXT_PUBLIC_CONVEX_URL / VITE_CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL";
  return `"use client";

import * as React from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";

const convexUrl = ${convexEnv};

if (!convexUrl) {
  if (typeof window !== "undefined") {
    console.warn(
      "[ghostinit] ${convexKey} is not set – Convex client will fail. Run \`npx convex dev\` to generate .env.local",
    );
  }
}

export const convexClient = new ConvexReactClient(convexUrl ?? "");

/**
 * ConvexClientProvider — standalone provider that can be composed inside app Providers.
 * Wraps Better Auth client for Convex auth integration per @convex-dev/better-auth docs.
 * Use in apps/web/src/components/providers.tsx when convex inUse.
 */
export function ConvexClientProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
`;
}

export function convexClientProviderExpoContent(): string {
  return `"use client";

import * as React from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  if (typeof window !== "undefined") {
    console.warn("[ghostinit] EXPO_PUBLIC_CONVEX_URL / NEXT_PUBLIC_CONVEX_URL not set – Convex client needs URL");
  }
}

export const convexClient = new ConvexReactClient(convexUrl ?? "");

export function ConvexClientProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConvexBetterAuthProvider client={convexClient} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
`;
}

export function providersFileContentConvex(router: RouterType = "next"): string {
  if (router === "tanstack") {
    return `"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider, PostHogPageView } from "@repo/analytics/client";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Set it in .env.local via \`npx convex dev\`");
}
const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            <React.Suspense fallback={null}>
              <PostHogPageView />
            </React.Suspense>
            {children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </PostHogProvider>
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}
`;
  }
  return `"use client";

import { useState, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider, PostHogPageView } from "@repo/analytics/client";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Set it in .env.local via \`npx convex dev\`");
}
const convex = new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            <Suspense fallback={null}>
              <PostHogPageView />
            </Suspense>
            {children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </PostHogProvider>
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}
`;
}

// Backward compat aliases
export function convexClientFileContent(): string {
  return convexClientProviderContent();
}
export function convexProvidersFileContent(): string {
  return convexClientProviderContent();
}
