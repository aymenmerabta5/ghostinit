export {
  notFoundFileContent,
  errorFileContent,
  globalErrorFileContent,
  unauthorizedFileContent,
  forbiddenFileContent,
  loadingFileContent,
  systemFeatureFiles,
} from "./system-pages.js";
export type RouterType = "next" | "tanstack";

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
  useRouter,
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { AppProviders } from '../components/providers.js'
import { AppShell } from '../components/app-shell.js'
import {
  useStandaloneSurfaceLocale,
} from '../lib/translations.standalone.js'
import { RouteErrorScreen, RouteNotFoundScreen } from '@/features/system/route-fallbacks'
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
  const router = useRouter()
  const locale = useStandaloneSurfaceLocale()
  void locale
  return (
${fallbackDocumentOpen}
      <RouteErrorScreen error={error} retry={() => { void router.invalidate() }} />
    </RootDocument>
  )
}

function RootNotFoundComponent(): React.JSX.Element {
  const locale = useStandaloneSurfaceLocale()
  void locale
  return (
${fallbackDocumentOpen}
      <RouteNotFoundScreen />
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
