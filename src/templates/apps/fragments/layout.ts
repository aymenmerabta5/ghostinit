// @allow-long 481: shared layout fragments deduplicated Next/TanStack
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

export function nextRootLayoutContent(hasI18n = false): string {
  const i18nImports = hasI18n
    ? `import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { connection } from "next/server";
import { getSurfaceTranslations } from "../lib/translations.server.js";
import { StandaloneLocaleLoadingFallback } from "../lib/translations.standalone.js";
import { localeDirection, type Locale } from "../i18n/routing.js";`
    : "";
  const localeBoundary = hasI18n
    ? `const localeBootstrapScript = '(function(){try{var match=document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]*)/);var locale=match?decodeURIComponent(match[1]):"en";if(locale!=="en"&&locale!=="fr"&&locale!=="ar")locale="en";document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";}catch{}})();';

async function LocalizedApp({ children }: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  await connection();
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();
  const localeDocumentScript = "document.documentElement.lang=" + JSON.stringify(locale) + ";document.documentElement.dir=" + JSON.stringify(localeDirection[locale]) + ";";
  return <>
    <script id="locale-request" dangerouslySetInnerHTML={{ __html: localeDocumentScript }} />
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppProviders><Header />{children}</AppProviders>
    </NextIntlClientProvider>
  </>;
}`
    : "";
  const documentHead = hasI18n
    ? `<head><script id="locale-bootstrap" dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} /></head>`
    : "";
  const providers = hasI18n
    ? `<React.Suspense fallback={<StandaloneLocaleLoadingFallback />}>
          <LocalizedApp>{children}</LocalizedApp>
        </React.Suspense>`
    : `<AppProviders><Header />{children}</AppProviders>`;
  const metadataDeclaration = hasI18n
    ? `export async function generateMetadata(): Promise<Metadata> {
  const t = await getSurfaceTranslations("metadata");
  return { title: t("siteTitle"), description: t("siteDescription") };
}`
    : `export const metadata: Metadata = {
  title: "GhostInit App",
  description: "Your opinionated modular monolith with dark mode",
};`;

  return `import * as React from "react";
import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { AppProviders } from "../components/providers.js";
import { Header } from "../components/header.js";
${i18nImports}
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

${metadataDeclaration}

${localeBoundary}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      ${documentHead}
      <body className={\`\${dmSans.variable} \${jetbrainsMono.variable} antialiased bg-background text-foreground\`}>
        ${providers}
      </body>
    </html>
  );
}
`;
}

export function tanstackRootDocumentContent(hasI18n = false): string {
  const localeImports = hasI18n
    ? `import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { localeMetadata } from '../lib/i18n.js'
import { getLocaleFromHeaders } from '../lib/i18n.server.js'
import { defaultLocale, localeDirection, type Locale } from '../i18n/config.js'`
    : "";
  const localeServerFunction = hasI18n
    ? `const getRequestLocale = createServerFn({ method: 'GET' }).handler(() => {
  const headers = new Headers()
  getRequestHeaders().forEach((value, key) => headers.set(key, value))
  return getLocaleFromHeaders(headers)
})
`
    : "";
  const localeLoader = hasI18n ? "  loader: () => getRequestLocale(),\n" : "";
  const localeRead = hasI18n ? "  const locale = Route.useLoaderData()\n" : "";
  const rootDocumentOpen = hasI18n ? "    <RootDocument locale={locale}>" : "    <RootDocument>";
  const providersOpen = hasI18n
    ? "      <AppProviders queryClient={queryClient} initialLocale={locale}>"
    : "      <AppProviders queryClient={queryClient}>";
  const documentSignature = hasI18n
    ? "function RootDocument({ children, locale = defaultLocale }: { children: React.ReactNode; locale?: Locale }) {"
    : "function RootDocument({ children }: { children: React.ReactNode }) {";
  const htmlAttributes = hasI18n ? "lang={locale} dir={localeDirection[locale]}" : 'lang="en"';
  const fallbackDocumentOpen = hasI18n
    ? "    <RootDocument locale={locale}>"
    : "    <RootDocument>";
  const headDeclaration = hasI18n ? "  head: ({ loaderData }) => ({" : "  head: () => ({";
  const headMetadata = hasI18n
    ? `      { title: localeMetadata[loaderData ?? defaultLocale].title },
      { name: 'description', content: localeMetadata[loaderData ?? defaultLocale].description },`
    : `      { title: 'GhostInit App' },`;

  return `/// <reference types="vite/client" />
import * as React from 'react'
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { AppProviders } from '../components/providers.js'
import { Header } from '../components/header.js'
import {
  useStandaloneSurfaceLocale,
  useStandaloneSurfaceTranslations,
} from '../lib/translations.standalone.js'
import appCss from '../styles/app.css?url'
${localeImports}

${localeServerFunction}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
${localeLoader}${headDeclaration}
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
${headMetadata}
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
      },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
  component: RootComponent,
})

function RootErrorComponent({ error }: { error: unknown }): React.JSX.Element {
  const locale = useStandaloneSurfaceLocale()
  const t = useStandaloneSurfaceTranslations("errors")
  void locale
  React.useEffect(() => { console.error(error) }, [error])
  return (
${fallbackDocumentOpen}
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="rounded-xl border bg-card p-6 shadow-sm max-w-[480px] w-full">
          <h1 className="text-lg font-semibold tracking-tight">{t("unexpected.title")}</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">{t("unexpected.description")}</p>
        </div>
      </main>
    </RootDocument>
  )
}

function RootNotFoundComponent(): React.JSX.Element {
  const locale = useStandaloneSurfaceLocale()
  const t = useStandaloneSurfaceTranslations("errors")
  void locale
  return (
${fallbackDocumentOpen}
      <main className="${sharedNotFoundInner.mainClass}">
        <div className="rounded-xl border bg-card p-6 shadow-sm max-w-[420px] w-full">
          <h1 className="text-2xl font-semibold tracking-tight">{t("notFound.title")}</h1>
          <p className="text-sm text-muted-foreground max-w-[60ch] mt-2">{t("notFound.shortDescription")}</p>
        </div>
      </main>
    </RootDocument>
  )
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
${localeRead}  return (
${rootDocumentOpen}
${providersOpen}
        <Header />
        <Outlet />
      </AppProviders>
    </RootDocument>
  )
}

${documentSignature}
  return (
    <html ${htmlAttributes} suppressHydrationWarning>
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
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute('/$notFound')({
  component: NotFoundPage,
})

function NotFoundPage(): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl tracking-tight">{t("notFound.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link to="/" />} nativeButton={false} aria-label={t("notFound.backHome")}>{t("notFound.backHome")}</Button>
        </CardContent>
      </Card>
    </main>
  )
}
`;
  }
  return `import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getSurfaceTranslations } from "@/lib/translations.server";

async function NotFoundContent(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("errors");
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl tracking-tight">{t("notFound.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link href="/" />} nativeButton={false} aria-label={t("notFound.backHome")}>
            {t("notFound.backHome")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function NotFound(): React.JSX.Element {
  return <Suspense fallback={<main className="${sharedNotFoundInner.mainClass}" aria-busy="true" />}><NotFoundContent /></Suspense>;
}
`;
}
export function errorFileContent(router: RouterType): string {
  if (router === "tanstack") {
    // TanStack embeds errorComponent in __root.tsx; but provide standalone for completeness.
    return tanstackRootDocumentContent();
  }
  return `"use client";

import * as React from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useSurfaceTranslations } from "@/lib/translations";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="${sharedErrorInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1">{t("unexpected.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unexpected.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertTitle>{t("unexpected.alertTitle")}</AlertTitle>
            <AlertDescription className="truncate max-w-[65ch]">{error.message}</AlertDescription>
          </Alert>
          <Button onClick={() => reset()}>{t("unexpected.retry")}</Button>
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
import {
  standaloneSurfaceDirection,
  useStandaloneSurfaceLocale,
  useStandaloneSurfaceTranslations,
} from "@/lib/translations.standalone";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const locale = useStandaloneSurfaceLocale();
  const t = useStandaloneSurfaceTranslations("errors");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang={locale} dir={standaloneSurfaceDirection(locale)} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <main className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="rounded-xl border bg-card p-6 shadow-sm max-w-[480px] w-full">
            <h1 className="text-lg font-semibold tracking-tight">{t("global.title")}</h1>
            <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">{t("global.description")}</p>
            <p className="text-xs text-muted-foreground truncate mt-4">{error.message}</p>
            <Button onClick={() => reset()} className="mt-6">
              {t("global.retry")}
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
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute('/unauthorized')({
  component: UnauthorizedPage,
})

function UnauthorizedPage(): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl tracking-tight">{t("unauthorized.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unauthorized.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link to="/sign-in" />} nativeButton={false} aria-label={t("unauthorized.signIn")}>{t("unauthorized.signIn")}</Button>
        </CardContent>
      </Card>
    </main>
  )
}
`;
  }
  return `import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getSurfaceTranslations } from "@/lib/translations.server";

async function UnauthorizedContent(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("errors");
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl tracking-tight">{t("unauthorized.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unauthorized.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link href="/sign-in" />} nativeButton={false} aria-label={t("unauthorized.signIn")}>
            {t("unauthorized.signIn")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function Unauthorized(): React.JSX.Element {
  return <Suspense fallback={<main className="${sharedNotFoundInner.mainClass}" aria-busy="true" />}><UnauthorizedContent /></Suspense>;
}
`;
}
export function forbiddenFileContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute('/forbidden')({
  component: ForbiddenPage,
})

function ForbiddenPage(): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl tracking-tight">{t("forbidden.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("forbidden.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link to="/" />} nativeButton={false} aria-label={t("forbidden.backHome")}>{t("forbidden.backHome")}</Button>
        </CardContent>
      </Card>
    </main>
  )
}
`;
  }
  return `import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getSurfaceTranslations } from "@/lib/translations.server";

async function ForbiddenContent(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("errors");
  return (
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedNotFoundInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-2xl tracking-tight">{t("forbidden.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("forbidden.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button render={<Link href="/" />} nativeButton={false} aria-label={t("forbidden.backHome")}>
            {t("forbidden.backHome")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

export default function Forbidden(): React.JSX.Element {
  return <Suspense fallback={<main className="${sharedNotFoundInner.mainClass}" aria-busy="true" />}><ForbiddenContent /></Suspense>;
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
