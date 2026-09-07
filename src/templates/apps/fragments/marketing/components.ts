/** Generated marketing sections, split so formatted output remains within component limits. */
import {
  marketingFeaturesFragment,
  marketingFooterFragment,
  marketingHeroFragment,
  marketingQuickStartFragment,
} from "./sections.js";
import type { RouterType } from "./shared.js";

function wrapSection(
  router: RouterType,
  componentName: string,
  imports: string,
  body: string,
): string {
  if (router === "next") {
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

export function marketingHeroComponentContent(router: RouterType): string {
  const linkImport =
    router === "next"
      ? 'import Link from "next/link";'
      : 'import { Link } from "@tanstack/react-router";';
  return wrapSection(
    router,
    "MarketingHero",
    `${linkImport}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";`,
    marketingHeroFragment(router),
  );
}

export function marketingFeaturesComponentContent(router: RouterType): string {
  return wrapSection(
    router,
    "MarketingFeatures",
    'import { Badge } from "@/components/ui/badge";\nimport { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";',
    marketingFeaturesFragment(router),
  );
}

export function marketingQuickStartComponentContent(router: RouterType): string {
  return wrapSection(router, "MarketingQuickStart", "", marketingQuickStartFragment(router));
}

export function marketingFooterComponentContent(router: RouterType, hasBilling = true): string {
  const linkImport =
    router === "next"
      ? 'import Link from "next/link";'
      : 'import { Link } from "@tanstack/react-router";';
  return wrapSection(
    router,
    "MarketingFooter",
    linkImport,
    marketingFooterFragment(router, hasBilling),
  );
}
