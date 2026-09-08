import {
  errorFileContent,
  loadingFileContent,
  notFoundFileContent,
} from "../../../apps/fragments/layout.js";

export function singleLayout(hasI18n = false): string {
  return [
    "import * as React from 'react';",
    "import type { Metadata } from 'next';",
    ...(hasI18n
      ? [
          "import { NextIntlClientProvider } from 'next-intl';",
          "import { getLocale, getMessages } from 'next-intl/server';",
          "import { connection } from 'next/server';",
          "import { getSurfaceTranslations } from '@/lib/translations.server';",
          "import { StandaloneLocaleLoadingFallback } from '@/lib/translations.standalone';",
          "import { localeDirection, type Locale } from '@/i18n/routing';",
        ]
      : []),
    "import { Providers } from '@/components/providers';",
    "import { AppShell } from '@/components/app-shell';",
    "import './globals.css';",
    "",
    ...(hasI18n
      ? [
          "export async function generateMetadata(): Promise<Metadata> {",
          "  const t = await getSurfaceTranslations('metadata');",
          "  return { title: t('siteTitle'), description: t('siteDescription') };",
          "}",
        ]
      : [
          "export const metadata: Metadata = {",
          "  title: '__PROJECT_NAME__ | GhostInit',",
          "  description: 'A clear foundation for your next application',",
          "};",
        ]),
    "",
    ...(hasI18n
      ? [
          `const localeBootstrapScript = '(function(){try{var match=document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]*)/);var locale=match?decodeURIComponent(match[1]):"en";if(locale!=="en"&&locale!=="fr"&&locale!=="ar")locale="en";document.documentElement.lang=locale;document.documentElement.dir=locale==="ar"?"rtl":"ltr";}catch{}})();';`,
          "",
          "async function LocalizedApp({ children }: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {",
          "  await connection();",
          "  const locale = (await getLocale()) as Locale;",
          "  const messages = await getMessages();",
          '  const localeDocumentScript = "document.documentElement.lang=" + JSON.stringify(locale) + ";document.documentElement.dir=" + JSON.stringify(localeDirection[locale]) + ";";',
          "  return <>",
          '    <script id="locale-request" dangerouslySetInnerHTML={{ __html: localeDocumentScript }} />',
          "    <NextIntlClientProvider locale={locale} messages={messages}>",
          "      <Providers><AppShell>{children}</AppShell></Providers>",
          "    </NextIntlClientProvider>",
          "  </>;",
          "}",
          "",
        ]
      : []),
    "export default function RootLayout({",
    "  children,",
    "}: Readonly<{ children: React.ReactNode }>) {",
    "  return (",
    hasI18n
      ? "    <html lang='en' dir='ltr' suppressHydrationWarning>"
      : "    <html lang='en' suppressHydrationWarning>",
    ...(hasI18n
      ? [
          '      <head><script id="locale-bootstrap" dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} /></head>',
        ]
      : []),
    "      <body className='antialiased bg-background text-foreground'>",
    ...(hasI18n
      ? [
          "        <React.Suspense fallback={<StandaloneLocaleLoadingFallback />}>",
          "          <LocalizedApp>{children}</LocalizedApp>",
          "        </React.Suspense>",
        ]
      : ["        <Providers><AppShell>{children}</AppShell></Providers>"]),
    "      </body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function singleNotFoundPage(): string {
  return notFoundFileContent("next");
}

export function singleErrorPage(): string {
  return errorFileContent("next");
}

export function singleLoadingPage(): string {
  return loadingFileContent();
}
