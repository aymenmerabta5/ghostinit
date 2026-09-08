export function themeProviderFileContent(): string {
  return `"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export function ThemeProvider({ children, ...props }: ThemeProviderProps): React.JSX.Element {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  );
}
`;
}

export function themeToggleFileContent(): string {
  return `"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

export function ThemeToggle(): React.JSX.Element {
  const { resolvedTheme, setTheme } = useTheme();
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
      className="relative"
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
      aria-label={t("toggle")}
    >
      <Sun className="size-4 rotate-0 scale-100 transition-transform motion-reduce:transition-none dark:-rotate-90 dark:scale-0" data-icon="inline-start" aria-hidden />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-transform motion-reduce:transition-none dark:rotate-0 dark:scale-100" data-icon="inline-start" aria-hidden />
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
  const queryAuthBoundaryImport = hasAuth
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
  const queryAuthOpen = hasAuth ? `<QueryAuthCacheBoundary queryClient={client}>` : "";
  const queryAuthClose = hasAuth ? `</QueryAuthCacheBoundary>` : "";
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
