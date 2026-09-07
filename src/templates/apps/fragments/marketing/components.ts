/** Generated marketing sections, split so formatted output remains within component limits. */
import {
  marketingFeaturesFragment,
  marketingFooterFragment,
  marketingHeroFragment,
  marketingQuickStartFragment,
} from "./sections.js";
import { noMarketingCapabilities, type MarketingOptions, type RouterType } from "./shared.js";

export function wrapMarketingSection(
  router: RouterType,
  componentName: string,
  imports: string,
  body: string,
  forceClient = false,
): string {
  if (router === "next" && !forceClient) {
    return `import type * as React from "react";
${imports}
import { getSurfaceTranslations } from "@/lib/translations.server";

export async function ${componentName}(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("marketing");
  return (
${body}
  );
}
`;
  }
  return `"use client";

import type * as React from "react";
${imports}
import { useSurfaceTranslations } from "@/lib/translations";

export function ${componentName}(): React.JSX.Element {
  const t = useSurfaceTranslations("marketing");
  return (
${body}
  );
}
`;
}

export function marketingHeroComponentContent(
  router: RouterType,
  options: MarketingOptions = noMarketingCapabilities,
): string {
  const linkImport = !options.hasAuth
    ? ""
    : router === "next"
      ? 'import Link from "next/link";'
      : 'import { Link } from "@tanstack/react-router";';
  return wrapMarketingSection(
    router,
    "MarketingHero",
    `${linkImport}
import { ArrowRight, ArrowUpRight, Folder, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";`,
    marketingHeroFragment(router, options),
  );
}

export function marketingFeaturesComponentContent(
  router: RouterType,
  options: MarketingOptions = noMarketingCapabilities,
): string {
  return wrapMarketingSection(
    router,
    "MarketingFeatures",
    "",
    marketingFeaturesFragment(router, options),
  );
}

export function marketingQuickStartComponentContent(router: RouterType): string {
  return wrapMarketingSection(
    router,
    "MarketingQuickStart",
    "",
    marketingQuickStartFragment(router),
  );
}

export function marketingFooterComponentContent(
  router: RouterType,
  hasBilling = true,
  options: MarketingOptions = { ...noMarketingCapabilities, hasAuth: true },
): string {
  const linkImport =
    !options.hasAuth && !hasBilling
      ? ""
      : router === "next"
        ? 'import Link from "next/link";'
        : 'import { Link } from "@tanstack/react-router";';
  return wrapMarketingSection(
    router,
    "MarketingFooter",
    linkImport,
    marketingFooterFragment(router, hasBilling, options),
  );
}
