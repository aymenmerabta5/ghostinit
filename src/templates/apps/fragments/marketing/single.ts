/** Shared single-mode marketing producers for Next.js and TanStack Start. */
import * as v from "../../../versions.js";
import type { RouterType } from "./shared.js";

export interface SingleMarketingOptions {
  readonly hasAuth: boolean;
  readonly hasApi: boolean;
  readonly hasBilling: boolean;
  readonly hasEve: boolean;
  readonly database: "postgres" | "convex" | "none";
}

const NO_CAPABILITIES: SingleMarketingOptions = {
  hasAuth: false,
  hasApi: false,
  hasBilling: false,
  hasEve: false,
  database: "none",
};

export function singleMarketingPageContent(router: RouterType): string {
  const route =
    router === "tanstack"
      ? `import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage(): React.JSX.Element {`
      : `export default function HomePage(): React.JSX.Element {`;
  return `import type * as React from "react";
${router === "tanstack" ? route.split("\n\n")[0] : ""}
import { SingleMarketingClosing } from "@/components/marketing/closing";
import { SingleMarketingFeatures } from "@/components/marketing/features";
import { SingleMarketingHero } from "@/components/marketing/hero";
import { Separator } from "@/components/ui/separator";

${router === "tanstack" ? route.split("\n\n").slice(1).join("\n\n") : route}
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 p-6 md:gap-24 md:p-10 lg:p-12">
        <SingleMarketingHero />
        <Separator />
        <SingleMarketingFeatures />
        <Separator />
        <SingleMarketingClosing />
      </div>
    </main>
  );
}
`;
}

export function singleMarketingHeroComponentContent(
  router: RouterType,
  options: SingleMarketingOptions = NO_CAPABILITIES,
): string {
  const linkImport = !options.hasAuth
    ? ""
    : router === "next"
      ? 'import Link from "next/link";'
      : 'import { Link } from "@tanstack/react-router";';
  const eyebrow = router === "next" ? "single.eyebrowNext" : "single.eyebrowTanstack";
  const description =
    router === "next" ? "single.heroDescriptionNext" : "single.heroDescriptionTanstack";
  const signUpLink = router === "next" ? '<Link href="/sign-up" />' : '<Link to="/sign-up" />';
  const signInLink = router === "next" ? '<Link href="/sign-in" />' : '<Link to="/sign-in" />';
  const stackBadge =
    router === "next"
      ? `Next ${v.nextStack.next}`
      : `TanStack Start ${v.tanstackStart["@tanstack/react-start"]}`;
  const actions = options.hasAuth
    ? `<Button size="lg" render={${signUpLink}} nativeButton={false}>{t("single.startBuilding")}</Button>
        <Button size="lg" variant="outline" render={${signInLink}} nativeButton={false}>{t("single.signIn")}</Button>`
    : `<Button size="lg" render={<a href="#quick-start" />} nativeButton={false}>{t("single.quickStartTitle")}</Button>`;
  const databaseBadge =
    options.database === "postgres"
      ? `Drizzle ${v.database["drizzle-orm"]}`
      : options.database === "convex"
        ? `Convex ${v.convex.convex}`
        : null;
  const selectedBadges = [
    ...(databaseBadge ? [databaseBadge] : []),
    ...(options.hasAuth ? [`Better Auth ${v.auth["better-auth"]}`] : []),
  ]
    .map((label) => `<Badge variant="outline" className="font-mono text-xs">${label}</Badge>`)
    .join("\n        ");

  return `"use client";

import type * as React from "react";
${linkImport}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

export function SingleMarketingHero(): React.JSX.Element {
  const t = useSurfaceTranslations("marketing");
  return (
    <section className="flex flex-col gap-6 pt-8 md:pt-16">
      <Badge variant="secondary" className="w-fit">{t("${eyebrow}")}</Badge>
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl lg:text-[3.5rem]">{t("single.heroTitle", { project: "__PROJECT_NAME__" })}</h1>
        <p className="max-w-[65ch] text-lg leading-relaxed text-muted-foreground">{t("${description}")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        ${actions}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        <Badge variant="outline" className="font-mono text-xs">${stackBadge}</Badge>
        <Badge variant="outline" className="font-mono text-xs">React ${v.nextStack.react}</Badge>
        ${selectedBadges}
      </div>
    </section>
  );
}
`;
}

export function singleMarketingFeaturesComponentContent(
  router: RouterType,
  options: SingleMarketingOptions = NO_CAPABILITIES,
): string {
  const framework = router === "next" ? "Next" : "Tanstack";
  const sourceBadge = router === "next" ? "src/app" : "src/routes";
  const directories = [
    sourceBadge,
    "src/components",
    ...(options.hasApi || options.hasAuth || options.database !== "none" ? ["src/server"] : []),
    ...(options.hasEve ? ["agent/"] : []),
  ]
    .map((path) => `<Badge variant="secondary">${path}</Badge>`)
    .join("");
  const hasOptionalCard = options.hasAuth || options.hasBilling;
  const tokensSpan = options.hasAuth && options.hasBilling ? 7 : hasOptionalCard ? 12 : 6;
  const authCard = options.hasAuth
    ? `<Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">{t("single.authTitle")}</CardTitle>
            <CardDescription>{t("single.authDescription${framework}")}</CardDescription>
          </CardHeader>
        </Card>`
    : "";
  const billingCard = options.hasBilling
    ? `<Card className="md:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">{t("single.billingTitle")}</CardTitle>
            <CardDescription>{t("single.billingDescription")}</CardDescription>
          </CardHeader>
        </Card>`
    : "";
  return `"use client";

import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function SingleMarketingFeatures(): React.JSX.Element {
  const t = useSurfaceTranslations("marketing");
  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t("single.whyTitle${framework}")}</h2>
        <p className="max-w-[60ch] text-sm text-muted-foreground">{t("single.whyDescription${framework}")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <Card className="md:col-span-${hasOptionalCard ? 7 : 6}">
          <CardHeader>
            <CardTitle className="text-base">{t("single.flatTitle")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t("single.flatDescription${framework}")}</CardDescription>
          </CardHeader>
          <CardContent><div className="flex flex-wrap gap-2">${directories}</div></CardContent>
        </Card>
        ${authCard}
        ${billingCard}
        <Card className="md:col-span-${tokensSpan}">
          <CardHeader>
            <CardTitle className="text-base">{t("single.tokensTitle")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t("single.tokensDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2"><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> shadcn</span></Badge><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> Base UI</span></Badge></div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
`;
}

export function singleMarketingClosingComponentContent(
  router: RouterType,
  options: SingleMarketingOptions = NO_CAPABILITIES,
): string {
  const framework = router === "next" ? "Next" : "Tanstack";
  const signInLink = !options.hasAuth
    ? ""
    : router === "next"
      ? '<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("single.footerSignIn")}</Link>'
      : '<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("single.footerSignIn")}</Link>';
  const destinationLink = !options.hasBilling
    ? ""
    : router === "next"
      ? '<Link href="/billing" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("single.footerBilling")}</Link>'
      : '<Link to="/billing" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("single.footerBilling")}</Link>';
  const linkImport =
    !options.hasAuth && !options.hasBilling
      ? ""
      : router === "next"
        ? 'import Link from "next/link";'
        : 'import { Link } from "@tanstack/react-router";';

  return `"use client";

import type * as React from "react";
${linkImport}
import { useSurfaceTranslations } from "@/lib/translations";

export function SingleMarketingClosing(): React.JSX.Element {
  const t = useSurfaceTranslations("marketing");
  return (
    <>
      <section id="quick-start" className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t("single.quickStartTitle")}</h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">{t("single.quickStartDescription${framework}")}</p>
        </div>
        <div className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
          <div>cd __PROJECT_NAME__</div>
          <div>bun run install:bootstrap</div>
          <div>bun run dev</div>
        </div>
        <p className="text-sm text-muted-foreground">{t("single.quickStartServices")}</p>
      </section>
      <footer className="flex flex-col gap-4 border-t pt-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">{t("single.footerTagline")}</span>
          <div className="flex gap-4 text-xs">${signInLink}${destinationLink}</div>
        </div>
      </footer>
    </>
  );
}
`;
}
