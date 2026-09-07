import { wrapMarketingSection } from "./components.js";
import {
  marketingFeaturesFragment,
  marketingFooterFragment,
  marketingHeroFragment,
  marketingQuickStartFragment,
} from "./sections.js";
import { noMarketingCapabilities, type MarketingOptions, type RouterType } from "./shared.js";

export type SingleMarketingOptions = MarketingOptions;

export function singleMarketingPageContent(router: RouterType): string {
  const route =
    router === "tanstack"
      ? `export const Route = createFileRoute("/")({ component: HomePage });

function HomePage(): React.JSX.Element {`
      : `export default function HomePage(): React.JSX.Element {`;
  return `import type * as React from "react";
${router === "tanstack" ? 'import { createFileRoute } from "@tanstack/react-router";' : ""}
import { SingleMarketingClosing } from "@/components/marketing/closing";
import { SingleMarketingFeatures } from "@/components/marketing/features";
import { SingleMarketingHero } from "@/components/marketing/hero";

${route}
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-5 pt-6 sm:px-8 md:gap-20 lg:px-10">
        <SingleMarketingHero />
        <SingleMarketingFeatures />
        <SingleMarketingClosing />
      </div>
    </main>
  );
}
`;
}

function linkImport(router: RouterType): string {
  return router === "next"
    ? 'import Link from "next/link";'
    : 'import { Link } from "@tanstack/react-router";';
}

export function singleMarketingHeroComponentContent(
  router: RouterType,
  options: SingleMarketingOptions = noMarketingCapabilities,
): string {
  return wrapMarketingSection(
    router,
    "SingleMarketingHero",
    `${options.hasAuth ? linkImport(router) : ""}
import { ArrowRight, Folder, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";`,
    marketingHeroFragment(router, options, "single"),
    true,
  );
}

export function singleMarketingFeaturesComponentContent(
  router: RouterType,
  options: SingleMarketingOptions = noMarketingCapabilities,
): string {
  return wrapMarketingSection(
    router,
    "SingleMarketingFeatures",
    "",
    marketingFeaturesFragment(router, options, "single"),
    true,
  );
}

export function singleMarketingClosingComponentContent(
  router: RouterType,
  options: SingleMarketingOptions = noMarketingCapabilities,
): string {
  return wrapMarketingSection(
    router,
    "SingleMarketingClosing",
    options.hasAuth || options.hasBilling ? linkImport(router) : "",
    `<>
      ${marketingQuickStartFragment(router)}
      ${marketingFooterFragment(router, options.hasBilling, options)}
    </>`,
    true,
  );
}
