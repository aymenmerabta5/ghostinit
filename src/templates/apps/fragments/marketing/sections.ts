/**
 * Marketing sections – header, hero, features, quick-start, footer
 */
import type { RouterType } from "./shared.js";
import {
  sharedHeroTitle,
  sharedHeroDescNext,
  sharedHeroDescTanStack,
  sharedWhyHeader,
  sharedFeatureCardsNext,
  sharedFeatureCardsTanStack,
  versionBadgesNext,
  versionBadgesTanstack,
} from "./shared.js";

export function marketingHeaderFragment(_router: RouterType): string {
  // Kept as a compatibility export. The application-wide Header owns navigation.
  return "";
}

export function marketingHeroFragment(router: RouterType): string {
  const desc = router === "next" ? sharedHeroDescNext : sharedHeroDescTanStack;
  const eyebrowKey = router === "tanstack" ? "hero.eyebrowTanstack" : "hero.eyebrow";
  const ctas =
    router === "next"
      ? `          <div className="flex flex-wrap gap-3">
            <Button size="lg" render={<Link href="/sign-up" />} nativeButton={false} aria-label={t("hero.primaryCta")}>
              {t("hero.primaryCta")}
            </Button>
            <Button size="lg" variant="outline" render={<a href="https://github.com/ghostinit/ghostinit" target="_blank" rel="noreferrer" />} nativeButton={false} aria-label={t("hero.secondaryCta")}>
              {t("hero.secondaryCta")}
            </Button>
          </div>`
      : `          <div className="flex flex-wrap gap-3">
            <Button size="lg" render={<Link to="/sign-up" />} nativeButton={false} aria-label={t("hero.primaryCta")}>
              {t("hero.primaryCta")}
            </Button>
            <Button size="lg" variant="outline" render={<a href="https://github.com/ghostinit/ghostinit" target="_blank" rel="noreferrer" />} nativeButton={false} aria-label={t("hero.secondaryCta")}>
              {t("hero.secondaryCta")}
            </Button>
          </div>`;

  const versionBadges = router === "next" ? versionBadgesNext() : versionBadgesTanstack();

  return `        <section className="flex flex-col gap-8 pt-8 md:pt-16">
          <Badge variant="secondary" className="w-fit font-mono text-xs">{t("${eyebrowKey}")}</Badge>
          <div className="flex flex-col gap-4">
            <h1 className="max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-[3.75rem]">
              ${sharedHeroTitle}
            </h1>
            <p className="max-w-[60ch] text-lg text-muted-foreground leading-relaxed">
              ${desc}
            </p>
          </div>
${ctas}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
              <div className="flex gap-1.5"><span className="size-3 rounded-full bg-red-500/80" /><span className="size-3 rounded-full bg-yellow-500/80" /><span className="size-3 rounded-full bg-green-500/80" /></div>
              <span className="ms-2 font-mono text-xs text-muted-foreground">{t("hero.terminalTitle")}</span>
            </div>
            <div className="p-4 font-mono text-sm leading-relaxed">
              <div className="text-muted-foreground">$ bunx ghostinit create my-app --billing stripe,chargily</div>
              <div className="text-foreground">✓ {t("hero.terminalScaffolded", { project: "my-app", duration: "1.2s", count: 216 })}</div>
              <div className="text-muted-foreground">$ cd my-app && bun install && bun run dev</div>
              <div className="text-foreground">✓ {t("hero.terminalReady", { url: "http://localhost:3000" })}</div>
            </div>
          </div>
${versionBadges}
        </section>`;
}

export function marketingFeaturesFragment(router: RouterType): string {
  const cards = router === "next" ? sharedFeatureCardsNext : sharedFeatureCardsTanStack;
  return `        <section className="flex flex-col gap-8">
${sharedWhyHeader}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
${cards}
          </div>
        </section>`;
}

export function marketingQuickStartFragment(router: RouterType): string {
  const cmd =
    router === "next"
      ? `            <div>bunx ghostinit create my-app --mode monorepo</div>
            <div className="text-muted-foreground">cd my-app && bun install && bun run dev</div>`
      : `            <div>bunx ghostinit create my-app --framework tanstack-start</div>
            <div className="text-muted-foreground">cd my-app && bun install && bun run dev</div>`;

  const desc =
    router === "next"
      ? `{t("quickStart.descriptionNext")}`
      : `{t("quickStart.descriptionTanstack")}`;

  return `        <section className="flex flex-col gap-6 rounded-lg border bg-card p-6 md:p-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{t("quickStart.title")}</h2>
            <p className="text-sm text-muted-foreground max-w-[65ch]">${desc}</p>
          </div>
          <div className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
${cmd}
          </div>
        </section>`;
}

export function marketingFooterFragment(router: RouterType, hasBilling = true): string {
  const billingLink = hasBilling
    ? `              <Link href="/billing" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">{t("footer.billing")}</Link>`
    : "";
  const links =
    router === "next"
      ? `              <Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">{t("footer.signIn")}</Link>
${billingLink}`
      : `              <Link to="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">{t("footer.signIn")}</Link>
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">{t("footer.dashboard")}</Link>`;

  return `        <footer className="flex flex-col gap-4 border-t pt-8">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{t("footer.tagline")}</span>
            <div className="flex gap-4 text-xs">
${links}
            </div>
          </div>
        </footer>`;
}
