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
    "import { Header } from '@/components/header';",
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
          "  title: '__PROJECT_NAME__ — GhostInit App',",
          "  description: 'Opinionated single all-in-one Next.js starter with Better Auth + Drizzle + Billing flexible and dark mode',",
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
          "      <Providers><Header />{children}</Providers>",
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
      : ["        <Providers><Header />{children}</Providers>"]),
    "      </body>",
    "    </html>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function singleNotFoundPage(): string {
  return [
    "import * as React from 'react';",
    "import { Suspense } from 'react';",
    "import Link from 'next/link';",
    "import { Button } from '@/components/ui/button';",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';",
    "import { getSurfaceTranslations } from '@/lib/translations.server';",
    "",
    "async function NotFoundContent(): Promise<React.JSX.Element> {",
    "  const t = await getSurfaceTranslations('errors');",
    "  return (",
    "    <main className='min-h-screen bg-background flex items-center justify-center p-6'>",
    "      <Card className='w-full max-w-[420px] shadow-sm'>",
    "        <CardHeader>",
    "          <CardTitle className='text-2xl tracking-tight'>{t('notFound.title')}</CardTitle>",
    "          <CardDescription className='max-w-[60ch]'>{t('notFound.description')}</CardDescription>",
    "        </CardHeader>",
    "        <CardContent className='flex flex-col gap-3'>",
    "          <Button render={<Link href='/' />} nativeButton={false}>{t('notFound.backHome')}</Button>",
    "        </CardContent>",
    "      </Card>",
    "    </main>",
    "  );",
    "}",
    "",
    "export default function NotFound(): React.JSX.Element {",
    "  return <Suspense fallback={<main className='min-h-screen bg-background flex items-center justify-center p-6' aria-busy='true' />}><NotFoundContent /></Suspense>;",
    "}",
    "",
  ].join("\n");
}

export function singleErrorPage(): string {
  return [
    '"use client";',
    "",
    "import * as React from 'react';",
    "import { useEffect } from 'react';",
    "import { Button } from '@/components/ui/button';",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';",
    "import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';",
    "import { useSurfaceTranslations } from '@/lib/translations';",
    "",
    "export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void; }): React.JSX.Element {",
    "  const t = useSurfaceTranslations('errors');",
    "  useEffect(() => { console.error(error); }, [error]);",
    "  return (",
    "    <main className='min-h-screen bg-background flex items-center justify-center p-6'>",
    "      <Card className='w-full max-w-[480px]'>",
    "        <CardHeader>",
    "          <CardTitle>{t('unexpected.title')}</CardTitle>",
    "          <CardDescription className='max-w-[60ch]'>{t('unexpected.description')}</CardDescription>",
    "        </CardHeader>",
    "        <CardContent className='flex flex-col gap-4'>",
    "          <Alert variant='destructive'>",
    "            <AlertTitle>{t('unexpected.alertTitle')}</AlertTitle>",
    "            <AlertDescription className='truncate max-w-[65ch]'>{error.message}</AlertDescription>",
    "          </Alert>",
    "          <Button onClick={() => reset()}>{t('unexpected.retry')}</Button>",
    "        </CardContent>",
    "      </Card>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function singleLoadingPage(): string {
  return [
    "import * as React from 'react';",
    "import { Skeleton } from '@/components/ui/skeleton';",
    "",
    "export default function Loading(): React.JSX.Element {",
    "  return (",
    "    <main className='min-h-screen bg-background'>",
    "      <div className='mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8'>",
    "        <Skeleton className='h-8 w-32' />",
    "        <Skeleton className='h-64 w-full' />",
    "        <div className='grid gap-4 md:grid-cols-3'>",
    "          <Skeleton className='h-32' />",
    "          <Skeleton className='h-32' />",
    "          <Skeleton className='h-32' />",
    "        </div>",
    "      </div>",
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}
