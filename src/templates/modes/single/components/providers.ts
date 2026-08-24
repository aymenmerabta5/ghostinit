export function providersSingleContent(hasAnalytics = true): string {
  return [
    '"use client";',
    "",
    "import * as React from 'react';",
    `import { useState${hasAnalytics ? ", Suspense" : ""} } from 'react';`,
    "import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
    "import { ThemeProvider } from '@/components/theme-provider';",
    ...(hasAnalytics
      ? [
          "import { PostHogProvider } from '@/components/analytics/posthog-provider';",
          "import { PostHogPageView } from '@/components/analytics/posthog-pageview';",
        ]
      : []),
    "import { Toaster } from '@/components/ui/sonner';",
    "",
    "export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {",
    "  const [queryClient] = useState(() => new QueryClient());",
    "  return (",
    "    <QueryClientProvider client={queryClient}>",
    ...(hasAnalytics ? ["      <PostHogProvider>"] : []),
    '        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>',
    ...(hasAnalytics
      ? [
          "          <Suspense fallback={null}>",
          "            <PostHogPageView />",
          "          </Suspense>",
        ]
      : []),
    "          {children}",
    '          <Toaster richColors position="bottom-right" />',
    "        </ThemeProvider>",
    ...(hasAnalytics ? ["      </PostHogProvider>"] : []),
    "    </QueryClientProvider>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function providersSingleContentConvex(hasAnalytics = true, hasAuth = true): string {
  return [
    '"use client";',
    "",
    "import * as React from 'react';",
    `import { useState${hasAnalytics ? ", Suspense" : ""} } from 'react';`,
    "import { QueryClient, QueryClientProvider } from '@tanstack/react-query';",
    "import { ConvexReactClient } from 'convex/react';",
    hasAuth
      ? "import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';"
      : "import { ConvexProvider } from 'convex/react';",
    ...(hasAuth ? ["import { authClient } from '@/lib/auth-client';"] : []),
    "import { ThemeProvider } from '@/components/theme-provider';",
    ...(hasAnalytics
      ? [
          "import { PostHogProvider } from '@/components/analytics/posthog-provider';",
          "import { PostHogPageView } from '@/components/analytics/posthog-pageview';",
        ]
      : []),
    "import { Toaster } from '@/components/ui/sonner';",
    "",
    "const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;",
    "if (!convexUrl) {",
    "  console.warn('[ghostinit] NEXT_PUBLIC_CONVEX_URL not set – Convex client will fail. Run npx convex dev');",
    "}",
    "const convex = new ConvexReactClient(convexUrl ?? '');",
    "",
    "export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {",
    "  const [queryClient] = useState(() => new QueryClient());",
    "  return (",
    hasAuth
      ? "    <ConvexBetterAuthProvider client={convex} authClient={authClient}>"
      : "    <ConvexProvider client={convex}>",
    "      <QueryClientProvider client={queryClient}>",
    ...(hasAnalytics ? ["        <PostHogProvider>"] : []),
    '          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>',
    ...(hasAnalytics
      ? [
          "            <Suspense fallback={null}>",
          "              <PostHogPageView />",
          "            </Suspense>",
        ]
      : []),
    "            {children}",
    '            <Toaster richColors position="bottom-right" />',
    "          </ThemeProvider>",
    ...(hasAnalytics ? ["        </PostHogProvider>"] : []),
    "      </QueryClientProvider>",
    hasAuth ? "    </ConvexBetterAuthProvider>" : "    </ConvexProvider>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function singleProvidersTanstackContent(): string {
  return [
    '"use client"',
    "import * as React from 'react'",
    "import { useState } from 'react'",
    "import { QueryClient, QueryClientProvider } from '@tanstack/react-query'",
    "import { ThemeProvider } from '@/components/theme-provider'",
    "import { Toaster } from '@/components/ui/sonner'",
    "export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {",
    "  const [queryClient] = useState(() => new QueryClient())",
    "  return (",
    "    <QueryClientProvider client={queryClient}>",
    "      <ThemeProvider attribute='class' defaultTheme='light' enableSystem={false} disableTransitionOnChange>",
    "        {children}",
    "        <Toaster richColors position='bottom-right' />",
    "      </ThemeProvider>",
    "    </QueryClientProvider>",
    "  )",
    "}",
    "",
  ].join("\n");
}

export function singleProvidersTanstackContentConvex(hasAuth = true): string {
  return [
    '"use client"',
    "import * as React from 'react'",
    "import { useState } from 'react'",
    "import { QueryClient, QueryClientProvider } from '@tanstack/react-query'",
    "import { ConvexReactClient } from 'convex/react'",
    hasAuth
      ? "import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'"
      : "import { ConvexProvider } from 'convex/react'",
    ...(hasAuth ? ["import { authClient } from '@/lib/auth-client'"] : []),
    "import { ThemeProvider } from '@/components/theme-provider'",
    "import { Toaster } from '@/components/ui/sonner'",
    "const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL",
    "if (!convexUrl) { console.warn('[ghostinit] VITE_CONVEX_URL not set – Convex client will fail. Run bunx convex dev') }",
    "const convex = new ConvexReactClient(convexUrl ?? '')",
    "export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {",
    "  const [queryClient] = useState(() => new QueryClient())",
    "  return (",
    hasAuth
      ? "    <ConvexBetterAuthProvider client={convex} authClient={authClient}>"
      : "    <ConvexProvider client={convex}>",
    "      <QueryClientProvider client={queryClient}>",
    "        <ThemeProvider attribute='class' defaultTheme='light' enableSystem={false} disableTransitionOnChange>",
    "          {children}",
    "          <Toaster richColors position='bottom-right' />",
    "        </ThemeProvider>",
    "      </QueryClientProvider>",
    hasAuth ? "    </ConvexBetterAuthProvider>" : "    </ConvexProvider>",
    "  )",
    "}",
    "",
  ].join("\n");
}
