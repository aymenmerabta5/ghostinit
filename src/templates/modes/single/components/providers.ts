import { convexAuthBridgeContent } from "../../../apps/fragments/convex-providers.js";

interface ProviderOptions {
  framework: "next" | "tanstack";
  hasAnalytics: boolean;
  isConvex: boolean;
  hasAuth: boolean;
  hasI18n: boolean;
}

function providerContent(options: ProviderOptions): string {
  const { framework, hasAnalytics, isConvex, hasAuth, hasI18n } = options;
  const analyticsImports = hasAnalytics
    ? `import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { PostHogPageView } from "@/components/analytics/posthog-pageview";`
    : "";
  const convexImports = isConvex
    ? `import { ConvexReactClient${hasAuth ? ", ConvexProviderWithAuth" : ", ConvexProvider"} } from "convex/react";
${hasAuth ? 'import { authClient } from "@/lib/auth-client";' : ""}
import { env } from "@/lib/env/${framework === "tanstack" ? "vite" : "next"}";`
    : "";
  const i18nImport =
    framework === "tanstack" && hasI18n
      ? `import { I18nProvider, type Locale } from "@/lib/i18n";`
      : "";
  const queryAuthBoundaryImport = hasAuth
    ? `import { QueryAuthCacheBoundary } from "@/components/query-auth-boundary";`
    : "";
  const convexSetup = isConvex
    ? `const convexUrl = env.${
        framework === "tanstack" ? "VITE_CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL"
      };
if (!convexUrl) {
  throw new Error("${
    framework === "tanstack" ? "VITE_CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL"
  } is not set. Run bunx convex dev and update the app environment.");
}
const convexClient = new ConvexReactClient(convexUrl);
${hasAuth ? convexAuthBridgeContent() : ""}`
    : "";
  const convexOpen = !isConvex
    ? ""
    : hasAuth
      ? `<ConvexProviderWithAuth client={convexClient} useAuth={useConvexBetterAuth}>`
      : `<ConvexProvider client={convexClient}>`;
  const convexClose = !isConvex ? "" : hasAuth ? `</ConvexProviderWithAuth>` : `</ConvexProvider>`;
  const analyticsOpen = hasAnalytics ? `<PostHogProvider>` : "";
  const analyticsClose = hasAnalytics ? `</PostHogProvider>` : "";
  const i18nOpen =
    framework === "tanstack" && hasI18n ? `<I18nProvider initialLocale={initialLocale}>` : "";
  const i18nClose = framework === "tanstack" && hasI18n ? `</I18nProvider>` : "";
  const initialLocaleProperty =
    framework === "tanstack" && hasI18n ? "  initialLocale: Locale;\n" : "";
  const initialLocaleParameter = framework === "tanstack" && hasI18n ? ", initialLocale" : "";
  const queryAuthOpen = hasAuth ? `<QueryAuthCacheBoundary queryClient={client}>` : "";
  const queryAuthClose = hasAuth ? `</QueryAuthCacheBoundary>` : "";
  const pageView = hasAnalytics
    ? `<React.Suspense fallback={null}>
              <PostHogPageView />
            </React.Suspense>`
    : "";

  return `"use client";

import * as React from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
${analyticsImports}
${convexImports}
${i18nImport}
${queryAuthBoundaryImport}

${convexSetup}

export interface AppProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
${initialLocaleProperty}}

export function AppProviders({ children, queryClient${initialLocaleParameter} }: AppProvidersProps): React.JSX.Element {
  const client = queryClient ?? getQueryClient();
  return (
    <QueryClientProvider client={client}>
        ${i18nOpen}
          ${convexOpen}
            <ThemeProvider>
              ${queryAuthOpen}
              ${analyticsOpen}
                ${pageView}
                {children}
                <Toaster richColors position="bottom-right" />
              ${analyticsClose}
              ${queryAuthClose}
            </ThemeProvider>
          ${convexClose}
        ${i18nClose}
    </QueryClientProvider>
  );
}

export const Providers = AppProviders;
`;
}

export function providersSingleContent(
  hasAnalytics = true,
  hasI18n = false,
  hasAuth = true,
): string {
  return providerContent({
    framework: "next",
    hasAnalytics,
    isConvex: false,
    hasAuth,
    hasI18n,
  });
}

export function providersSingleContentConvex(
  hasAnalytics = true,
  hasAuth = true,
  hasI18n = false,
): string {
  return providerContent({ framework: "next", hasAnalytics, isConvex: true, hasAuth, hasI18n });
}

export function singleProvidersTanstackContent(
  hasAnalytics = true,
  hasI18n = false,
  hasAuth = true,
): string {
  return providerContent({
    framework: "tanstack",
    hasAnalytics,
    isConvex: false,
    hasAuth,
    hasI18n,
  });
}

export function singleProvidersTanstackContentConvex(
  hasAuth = true,
  hasAnalytics = true,
  hasI18n = false,
): string {
  return providerContent({ framework: "tanstack", hasAnalytics, isConvex: true, hasAuth, hasI18n });
}
