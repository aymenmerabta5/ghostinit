import { designPreviewFragment, projectPreviewFragment } from "./preview.js";
import {
  noMarketingCapabilities,
  sharedFoundation,
  sharedWhyHeader,
  type MarketingLayout,
  type MarketingOptions,
  type RouterType,
} from "./shared.js";

export function marketingHeroFragment(
  router: RouterType,
  options: MarketingOptions = noMarketingCapabilities,
  layout: MarketingLayout = "monorepo",
): string {
  const description = router === "next" ? "hero.descriptionNext" : "hero.descriptionTanstack";
  const linkProp = router === "next" ? "href" : "to";
  const primary = options.hasAuth ? `<Link ${linkProp}="/sign-up" />` : '<a href="#quick-start" />';
  const secondary =
    layout === "monorepo"
      ? `<Button size="lg" variant="outline" render={<a href="https://github.com/aymenmerabta5/ghostinit" target="_blank" rel="noreferrer" />} nativeButton={false}>{t("hero.secondaryCta")}<ArrowUpRight data-icon="inline-end" aria-hidden /></Button>`
      : options.hasAuth
        ? `<Button size="lg" variant="outline" render={<Link ${linkProp}="/sign-in" />} nativeButton={false}>{t("single.signIn")}</Button>`
        : "";
  return `<section className="grid items-center gap-10 pt-6 sm:pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-16">
        <div className="flex min-w-0 flex-col items-start gap-7">
          <h1 className="text-[2.625rem] font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-[3.5rem]">
            <span className="block">{t("hero.title")}</span>
            <span className="block text-primary">{t("hero.titleAccent")}</span>
          </h1>
          <p className="max-w-[43ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">{t("${description}")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" render={${primary}} nativeButton={false}>{t("${options.hasAuth ? "hero.primaryCta" : "single.quickStartTitle"}")}<ArrowRight className="rtl:rotate-180" data-icon="inline-end" aria-hidden /></Button>
            ${secondary}
          </div>
        </div>
        ${projectPreviewFragment(router, options, layout)}
      </section>`;
}

export function marketingFeaturesFragment(
  router: RouterType,
  options: MarketingOptions = noMarketingCapabilities,
  layout: MarketingLayout = "monorepo",
): string {
  const framework = router === "next" ? "Next" : "Tanstack";
  const foundation =
    layout === "single"
      ? `<article>
              <h3 className="text-xl font-semibold leading-snug tracking-tight">{t("single.flatTitle")}</h3>
              <p className="mt-3 max-w-[48ch] text-sm leading-6 text-muted-foreground">{t("single.flatDescription${framework}")}</p>
            </article>`
      : sharedFoundation;
  const capabilities = [
    ...(options.hasAuth
      ? [{ title: "single.authTitle", description: `single.authDescription${framework}` }]
      : []),
    ...(options.hasApi
      ? [{ title: "features.apiTitle", description: `features.apiDescription${framework}` }]
      : []),
    ...(options.hasBilling
      ? [{ title: "single.billingTitle", description: "single.billingDescription" }]
      : []),
  ];
  const capabilityRows =
    capabilities.length === 0
      ? ""
      : `<dl className="space-y-5 border-t border-border pt-6">
              {[
${capabilities.map(({ title, description }) => `{ title: t("${title}"), description: t("${description}") },`).join("\n")}
              ].map(({ title, description }) => (
                <div key={title} className="space-y-1.5">
                  <dt className="text-sm font-semibold text-foreground">{title}</dt>
                  <dd className="max-w-[48ch] text-sm leading-6 text-muted-foreground">{description}</dd>
                </div>
              ))}
            </dl>`;
  return `<section className="space-y-10 border-t border-border pt-12 sm:pt-16">
        ${sharedWhyHeader}
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div className="space-y-7">
            ${foundation}
            ${capabilityRows}
          </div>
          ${designPreviewFragment()}
        </div>
      </section>`;
}

export function marketingQuickStartFragment(_router: RouterType): string {
  return `<section id="quick-start" className="space-y-7">
        <div className="max-w-2xl space-y-4">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{t("single.quickStartTitle")}</h2>
          <p className="max-w-[58ch] text-base leading-7 text-muted-foreground">{t("single.quickStartDescriptionNext")}</p>
        </div>
        <ol className="grid gap-5 rounded-lg border border-border bg-code p-6 font-mono text-sm leading-6 text-code-foreground md:grid-cols-[1fr_1.35fr_1fr] sm:p-8" dir="ltr">
          <li className="min-w-0 break-all"><code>cd __PROJECT_NAME__</code></li>
          <li className="min-w-0 break-all"><code>bun run install:bootstrap</code></li>
          <li className="min-w-0"><code>bun run dev</code></li>
        </ol>
        <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("single.quickStartServices")}</p>
      </section>`;
}

export function marketingFooterFragment(
  router: RouterType,
  hasBilling = true,
  options: MarketingOptions = { ...noMarketingCapabilities, hasAuth: true },
): string {
  const linkProp = router === "next" ? "href" : "to";
  const linkStyle =
    "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
  const signIn = options.hasAuth
    ? `<Link ${linkProp}="/sign-in" className="${linkStyle}">{t("footer.signIn")}</Link>`
    : "";
  const billing = hasBilling
    ? `<Link ${linkProp}="/billing" className="${linkStyle}">{t("footer.billing")}</Link>`
    : "";
  const navigation =
    signIn || billing
      ? `<nav aria-label={t("preview.footerNavigation")} className="flex flex-wrap items-center gap-x-6 gap-y-3">${signIn}${billing}</nav>`
      : "";
  return `<footer className="flex flex-col gap-5 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
        ${navigation}
      </footer>`;
}
