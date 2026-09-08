// @allow-long 481: shared layout fragments deduplicated Next/TanStack
export type RouterType = "next" | "tanstack";

export const sharedNotFoundInner = {
  title: "Page not found",
  description: "The page you are looking for does not exist or was moved.",
  cardClass: "w-full max-w-[440px] border-0 bg-transparent shadow-none",
  mainClass:
    "flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-background px-5 py-10 sm:px-8",
};

export const sharedErrorInner = {
  title: "Something went wrong",
  description: "An unexpected error occurred. You can try again.",
  cardClass: "w-full max-w-[440px] border-0 bg-transparent shadow-none",
};

export const sharedLoadingSkeletons = `<div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="space-y-3"><Skeleton className="h-9 w-48" /><Skeleton className="h-5 w-64 max-w-full" /></div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
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
      <AppProviders><AppShell>{children}</AppShell></AppProviders>
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
    : `<AppProviders><AppShell>{children}</AppShell></AppProviders>`;
  const metadataDeclaration = hasI18n
    ? `export async function generateMetadata(): Promise<Metadata> {
  const t = await getSurfaceTranslations("metadata");
  return { title: t("siteTitle"), description: t("siteDescription") };
}`
    : `export const metadata: Metadata = {
  title: "GhostInit App",
  description: "A clear foundation for your next application.",
};`;

  return `import * as React from "react";
import type { Metadata } from "next";
import { AppProviders } from "../components/providers.js";
import { AppShell } from "../components/app-shell.js";
${i18nImports}
import "./globals.css";

${metadataDeclaration}

${localeBoundary}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      ${documentHead}
      <body className="antialiased bg-background text-foreground">
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
import { AppShell } from '../components/app-shell.js'
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
      <main className="${sharedNotFoundInner.mainClass}">
        <div className="w-full max-w-[440px] space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{t("unexpected.title")}</h1>
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
        <div className="w-full max-w-[440px] space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{t("notFound.title")}</h1>
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
        <AppShell><Outlet /></AppShell>
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
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("notFound.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("notFound.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("notFound.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
    <main className="${sharedNotFoundInner.mainClass}">
      <Card className="${sharedErrorInner.cardClass}">
        <CardHeader>
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("unexpected.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unexpected.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
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
import "./globals.css";

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
        <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 sm:px-8">
          <div className="w-full max-w-[440px] space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{t("global.title")}</h1>
            <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">{t("global.description")}</p>
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
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("unauthorized.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unauthorized.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("unauthorized.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unauthorized.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("forbidden.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("forbidden.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("forbidden.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("forbidden.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
    <main className="min-h-[calc(100dvh-4rem)] bg-background" aria-busy="true">
      ${sharedLoadingSkeletons}
    </main>
  );
}
`;
}
