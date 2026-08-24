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
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange {...props}>
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

${sunIconSvg}

${moonIconSvg}

export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled aria-label="Toggle theme">
        <span className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label="Toggle theme"
    >
      <SunIcon className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" data-icon="inline-start" />
      <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" data-icon="inline-start" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
`;
}

/**
 * Re-exports for providers.tsx shared logic
 * Next and TanStack providers are 90% identical – theme + queryClient + PostHog + Toaster
 * When isConvex=true, wraps with ConvexReactClient + ConvexBetterAuthProvider per @convex-dev/better-auth docs
 */
export type RouterType = "next" | "tanstack";

export function providersFileContent(
  router: RouterType,
  isConvex = false,
  hasAnalytics = true,
): string {
  const analyticsImport = hasAnalytics
    ? `import { PostHogProvider, PostHogPageView } from "@repo/analytics/client";`
    : "";
  const suspenseStart = router === "tanstack" ? "<React.Suspense" : "<Suspense";
  const suspenseEnd = router === "tanstack" ? "</React.Suspense>" : "</Suspense>";
  const analyticsOpen = hasAnalytics
    ? `<PostHogProvider>\n          ${suspenseStart} fallback={null}>\n            <PostHogPageView />\n          ${suspenseEnd}`
    : "";
  const analyticsClose = hasAnalytics ? `</PostHogProvider>` : "";
  if (isConvex) {
    if (router === "tanstack") {
      return `"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
${analyticsImport}

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
        ${analyticsOpen}
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            {children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        ${analyticsClose}
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}
`;
    }
    return `"use client";

import { useState${hasAnalytics ? ", Suspense" : ""} } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
${analyticsImport}

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
        ${analyticsOpen}
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            {children}
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        ${analyticsClose}
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}
`;
  }

  if (router === "tanstack") {
    return `"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
${analyticsImport}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      ${analyticsOpen}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      ${analyticsClose}
    </QueryClientProvider>
  );
}
`;
  }
  return `"use client";

import { useState${hasAnalytics ? ", Suspense" : ""} } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./theme-provider.js";
import { Toaster } from "@/components/ui/sonner";
${analyticsImport}

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      ${analyticsOpen}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      ${analyticsClose}
    </QueryClientProvider>
  );
}
`;
}
