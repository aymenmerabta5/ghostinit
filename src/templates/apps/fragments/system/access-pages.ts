import { sharedNotFoundInner, type RouterType } from "./shared.js";

export function notFoundViewContent(router: RouterType): string {
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
export function unauthorizedViewContent(router: RouterType): string {
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
export function forbiddenViewContent(router: RouterType): string {
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
export function singleNotFoundViewContent(): string {
  return [
    "import * as React from 'react'",
    "import { createFileRoute, Link } from '@tanstack/react-router'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'",
    "import { useSurfaceTranslations } from '@/lib/translations'",
    "",
    "export const Route = createFileRoute('/$notFound')({ component: NotFoundPage })",
    "function NotFoundPage(): React.JSX.Element {",
    "  const t = useSurfaceTranslations('errors')",
    "  return (",
    "    <main className='min-h-screen bg-background flex items-center justify-center p-6'>",
    "      <Card className='w-full max-w-[420px] shadow-sm'>",
    "        <CardHeader><CardTitle className='text-2xl tracking-tight'>{t('notFound.title')}</CardTitle><CardDescription className='max-w-[60ch]'>{t('notFound.description')}</CardDescription></CardHeader>",
    "        <CardContent className='flex flex-col gap-3'><Button render={<Link to='/' />} nativeButton={false}>{t('notFound.backHome')}</Button></CardContent>",
    "      </Card>",
    "    </main>",
    "  )",
    "}",
    "",
  ].join("\n");
}
