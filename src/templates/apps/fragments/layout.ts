// @allow-long 425: shared layout fragments deduplicated Next/TanStack
/**
 * Shared layout fragments: layout.tsx metadata html suppressHydrationWarning, not-found, error use client, loading Skeleton
 * Deduplicates 70-80% between Next and TanStack root/not-found/error/loading
 */

export type RouterType = "next" | "tanstack";

export const sharedNotFoundInner = {
  title: "Page not found",
  description: "The page you are looking for does not exist or was moved.",
  cardClass: "w-full max-w-[420px] shadow-sm",
  mainClass: "min-h-screen bg-background flex items-center justify-center p-6",
};

export const sharedErrorInner = {
  title: "Something went wrong",
  description: "An unexpected error occurred. You can try again.",
  cardClass: "w-full max-w-[480px]",
};

export const sharedLoadingSkeletons = `<div className="mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>`;

export function nextRootLayoutContent(): string {
  return `import * as React from "react";
import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Providers } from "../components/providers.js";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GhostInit App",
  description: "Your opinionated modular monolith with dark mode",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={\`\${dmSans.variable} \${jetbrainsMono.variable} antialiased bg-background text-foreground\`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
`;
}

export function tanstackRootDocumentContent(): string {
  return `/// <reference types="vite/client" />
import * as React from 'react'
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '../components/theme-provider.js'
import { Toaster } from "@/components/ui/sonner";
import appCss from '../styles/app.css?url'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'GhostInit App' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  errorComponent: ({ error }) => (
    <RootDocument>
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="rounded-xl border bg-card p-6 shadow-sm max-w-[480px] w-full">
          <h1 className="text-lg font-semibold tracking-tight">${sharedErrorInner.title}</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">{String((error as Error)?.message ?? error)}</p>
        </div>
      </main>
    </RootDocument>
  ),
  notFoundComponent: () => (
    <RootDocument>
      <main className="${sharedNotFoundInner.mainClass}">
        <div className="rounded-xl border bg-card p-6 shadow-sm max-w-[420px] w-full">
          <h1 className="text-2xl font-semibold tracking-tight">${sharedNotFoundInner.title}</h1>
          <p className="text-sm text-muted-foreground max-w-[60ch] mt-2">The page does not exist.</p>
        </div>
      </main>
    </RootDocument>
  ),
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <Outlet />
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
`;
}

export function notFoundFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const Route = createFileRoute('/$notFound')({
  component: NotFoundPage,
})

function NotFoundPage(): React.JSX.Element {
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">${sharedNotFoundInner.title}</CardTitle>
          <CardDescription className="max-w-[60ch]">${sharedNotFoundInner.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild><Link to="/">Back to home</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
`;
  }
  return `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function NotFound(): React.JSX.Element {
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">${sharedNotFoundInner.title}</CardTitle>
          <CardDescription className="max-w-[60ch]">${sharedNotFoundInner.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;
}

export function errorFileContent(router: RouterType): string {
  if (router === "tanstack") {
    // TanStack embeds errorComponent in __root.tsx; but provide standalone for completeness
    return tanstackRootDocumentContent();
  }
  return `"use client";

import * as React from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="${sharedErrorInner.cardClass}">
        <CardHeader>
          <CardTitle>${sharedErrorInner.title}</CardTitle>
          <CardDescription className="max-w-[60ch]">${sharedErrorInner.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="truncate max-w-[65ch]">{error.message}</AlertDescription>
          </Alert>
          <Button onClick={() => reset()}>Try again</Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;
}

export function globalErrorFileContent(): string {
  return `"use client";

import * as React from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <main className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="rounded-xl border bg-card p-6 shadow-sm max-w-[480px] w-full">
            <h1 className="text-lg font-semibold tracking-tight">${sharedErrorInner.title}</h1>
            <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">${sharedErrorInner.description}</p>
            <p className="text-xs text-muted-foreground truncate mt-4">{error.message}</p>
            <Button onClick={() => reset()} className="mt-6">
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
`;
}

export function unauthorizedFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const Route = createFileRoute('/unauthorized')({
  component: UnauthorizedPage,
})

function UnauthorizedPage(): React.JSX.Element {
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Unauthorized</CardTitle>
          <CardDescription className="max-w-[60ch]">Please sign in to access this resource.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild><Link to="/sign-in">Sign in</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
`;
  }
  return `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function Unauthorized(): React.JSX.Element {
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Unauthorized</CardTitle>
          <CardDescription className="max-w-[60ch]">Please sign in to access this resource.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;
}

export function forbiddenFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const Route = createFileRoute('/forbidden')({
  component: ForbiddenPage,
})

function ForbiddenPage(): React.JSX.Element {
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Forbidden</CardTitle>
          <CardDescription className="max-w-[60ch]">You do not have permission to access this resource.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild><Link to="/">Back to home</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
`;
  }
  return `import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function Forbidden(): React.JSX.Element {
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">Forbidden</CardTitle>
          <CardDescription className="max-w-[60ch]">You do not have permission to access this resource.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
`;
}

export function loadingFileContent(): string {
  return `import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background">
      ${sharedLoadingSkeletons}
    </main>
  );
}
`;
}
