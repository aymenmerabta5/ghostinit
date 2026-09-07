/**
 * Shared theme-provider and theme-toggle fragments
 * Eliminates 100% duplication: both Next and TanStack use identical next-themes wrapper
 * SunIcon/MoonIcon inline SVG + rotate-0 scale-100 dark:-rotate-90 transition pattern shared
 */

export function themeProviderFileContent(): string {
  return `"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps): React.JSX.Element {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  );
}
`;
}

export const sunIconSvg = `function SunIcon(props: React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}`;

export const moonIconSvg = `function MoonIcon(props: React.SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9Z" />
    </svg>
  );
}`;

export function themeToggleFileContent(): string {
  return `"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

${sunIconSvg}

${moonIconSvg}

export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const t = useSurfaceTranslations("theme");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled aria-label={t("toggle")}>
        <span className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={t("toggle")}
    >
      <SunIcon className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" data-icon="inline-start" />
      <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" data-icon="inline-start" />
      <span className="sr-only">{t("toggle")}</span>
    </Button>
  );
}
`;
}

/** Shared web composition root for Next.js and TanStack Start. */
export type RouterType = "next" | "tanstack";

export function providersFileContent(
  router: RouterType,
  isConvex = false,
  hasAnalytics = true,
  hasI18n = false,
  hasAuth = false,
): string {
  const analyticsImport = hasAnalytics
    ? `import { PostHogProvider, PostHogPageView } from "@repo/analytics/client";`
    : "";
  const convexImport = isConvex
    ? `import { ConvexClientProvider } from "./providers/convex-client-provider.js";`
    : "";
  const i18nImport =
    router === "tanstack" && hasI18n
      ? `import { I18nProvider, type Locale } from "@/lib/i18n";`
      : "";
  const queryAuthBoundaryImport =
    router === "tanstack" && hasAuth
      ? `import { QueryAuthCacheBoundary } from "./query-auth-boundary.js";`
      : "";
  const analyticsOpen = hasAnalytics ? "<PostHogProvider>" : "";
  const analyticsClose = hasAnalytics ? "</PostHogProvider>" : "";
  const pageView = hasAnalytics
    ? `<React.Suspense fallback={null}>\n              <PostHogPageView />\n            </React.Suspense>`
    : "";
  const convexOpen = isConvex ? "<ConvexClientProvider>" : "";
  const convexClose = isConvex ? "</ConvexClientProvider>" : "";
  const i18nOpen =
    router === "tanstack" && hasI18n ? "<I18nProvider initialLocale={initialLocale}>" : "";
  const i18nClose = router === "tanstack" && hasI18n ? "</I18nProvider>" : "";
  const initialLocaleProperty =
    router === "tanstack" && hasI18n ? "  initialLocale: Locale;\n" : "";
  const initialLocaleParameter = router === "tanstack" && hasI18n ? ", initialLocale" : "";
  const queryAuthOpen =
    router === "tanstack" && hasAuth ? `<QueryAuthCacheBoundary queryClient={client}>` : "";
  const queryAuthClose = router === "tanstack" && hasAuth ? `</QueryAuthCacheBoundary>` : "";
  return `"use client";

import * as React from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
${analyticsImport}
${convexImport}
${i18nImport}
${queryAuthBoundaryImport}

export interface AppProvidersProps {
  children: React.ReactNode;
  queryClient?: QueryClient;
${initialLocaleProperty}}

export function AppProviders({ children, queryClient${initialLocaleParameter} }: AppProvidersProps): React.JSX.Element {
  const client = queryClient ?? getQueryClient();
  return (
    <QueryClientProvider client={client}>
      ${queryAuthOpen}
        ${i18nOpen}
          ${convexOpen}
            <ThemeProvider>
              ${analyticsOpen}
                ${pageView}
                {children}
                <Toaster richColors position="bottom-right" />
              ${analyticsClose}
            </ThemeProvider>
          ${convexClose}
        ${i18nClose}
      ${queryAuthClose}
    </QueryClientProvider>
  );
}

export const Providers = AppProviders;
`;
}
