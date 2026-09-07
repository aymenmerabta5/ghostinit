/**
 * Marketing shared constants – hero, why, feature cards Next vs TanStack
 */
import * as v from "../../../versions.js";

export type RouterType = "next" | "tanstack";

export interface MarketingSections {
  badgeRow: string;
  heroTitle: string;
  heroDescriptionNext: string;
  heroDescriptionTanStack: string;
  ctaButtons: string;
  versionBadges: string;
  whyHeader: string;
  featureCards: string;
  quickStartInner: string;
  footerInner: string;
}

export const sharedHeroTitle = `{t("hero.title")}`;

export const sharedHeroDescNext = `{t("hero.descriptionNext")}`;

export const sharedHeroDescTanStack = `{t("hero.descriptionTanstack")}`;

export const sharedWhyHeader = `<div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{t("features.title")}</h2>
            <p className="max-w-[60ch] text-sm text-muted-foreground">{t("features.description")}</p>
          </div>`;

export const sharedFeatureCardsNext = `            <Card className="md:col-span-7 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.scaffoldTitle")}</CardTitle>
                <CardDescription className="max-w-[60ch]">{t("features.scaffoldDescriptionNext")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">bunx ghostinit create my-app --billing stripe,chargily<br />cd my-app && bun install && bun run dev</div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.apiTitle")}</CardTitle>
                <CardDescription>{t("features.apiDescriptionNext")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">RPCHandler + Buffer.from(await request.arrayBuffer())</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.billingTitle")}</CardTitle>
                <CardDescription>{t("features.billingDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="secondary">stripe</Badge>
                <Badge variant="secondary">chargily</Badge>
                <Badge variant="secondary">paddle</Badge>
                <Badge variant="secondary">polar</Badge>
              </CardContent>
            </Card>

            <Card className="md:col-span-7 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.forkTitle")}</CardTitle>
                <CardDescription className="max-w-[60ch]">{t("features.forkDescriptionNext")}</CardDescription>
              </CardHeader>
              <CardContent className="rounded-md bg-muted p-3 font-mono text-xs">gh repo fork aymenmerabta5/ghostinit --clone<br />cd ghostinit && bun install && bun run dev</CardContent>
            </Card>`;

export const sharedFeatureCardsTanStack = `            <Card className="md:col-span-7 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.scaffoldTitle")}</CardTitle>
                <CardDescription className="max-w-[60ch]">{t("features.scaffoldDescriptionTanstack")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">bunx ghostinit create my-app --framework tanstack-start<br />cd my-app && bun install && bun run dev</div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.apiTitle")}</CardTitle>
                <CardDescription>{t("features.apiDescriptionTanstack")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">createServerFn + getRequestHeaders</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.billingTitle")}</CardTitle>
                <CardDescription>{t("features.billingDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="secondary">stripe</Badge>
                <Badge variant="secondary">chargily</Badge>
                <Badge variant="secondary">paddle</Badge>
                <Badge variant="secondary">polar</Badge>
              </CardContent>
            </Card>

            <Card className="md:col-span-7 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{t("features.forkTitle")}</CardTitle>
                <CardDescription className="max-w-[60ch]">{t("features.forkDescriptionTanstack")}</CardDescription>
              </CardHeader>
              <CardContent className="rounded-md bg-muted p-3 font-mono text-xs">gh repo fork aymenmerabta5/ghostinit --clone<br />cd ghostinit && bun install</CardContent>
            </Card>`;

export function versionBadgesNext(): string {
  return `          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className="font-mono text-xs">Next ${v.nextStack.next}</Badge>
            <Badge variant="outline" className="font-mono text-xs">React ${v.nextStack.react}</Badge>
            <Badge variant="outline" className="font-mono text-xs">Drizzle ${v.database["drizzle-orm"]}</Badge>
            <Badge variant="outline" className="font-mono text-xs">Better Auth ${v.auth["better-auth"]}</Badge>
          </div>`;
}

export function versionBadgesTanstack(): string {
  return `          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="outline" className="font-mono text-xs">TanStack Start ${v.tanstackStart["@tanstack/react-start"]}</Badge>
            <Badge variant="outline" className="font-mono text-xs">React ${v.nextStack.react}</Badge>
            <Badge variant="outline" className="font-mono text-xs">Drizzle ${v.database["drizzle-orm"]}</Badge>
            <Badge variant="outline" className="font-mono text-xs">Better Auth ${v.auth["better-auth"]}</Badge>
          </div>`;
}

export function marketingSections(): {
  heroBadge: string;
  heroTitle: string;
  features: string;
  quickStartTitle: string;
  footerTagline: string;
} {
  return {
    heroBadge: `{t("hero.eyebrow")}`,
    heroTitle: sharedHeroTitle,
    features: sharedWhyHeader,
    quickStartTitle: `{t("quickStart.title")}`,
    footerTagline: `{t("footer.tagline")}`,
  };
}
