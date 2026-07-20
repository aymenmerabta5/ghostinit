/**
 * Marketing page builder – composes header/hero/features/quick-start/footer
 */
import type { RouterType } from "./shared.js";
import {
  marketingHeaderFragment,
  marketingHeroFragment,
  marketingFeaturesFragment,
  marketingQuickStartFragment,
  marketingFooterFragment,
} from "./sections.js";

export function buildMarketingPageContent(router: RouterType): string {
  const header = marketingHeaderFragment(router);
  const hero = marketingHeroFragment(router);
  const features = marketingFeaturesFragment(router);
  const quickStart = marketingQuickStartFragment(router);
  const footer = marketingFooterFragment(router);

  if (router === "tanstack") {
    return `import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from '../components/theme-toggle.js'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
${header}

      <div className="mx-auto flex max-w-5xl flex-col gap-16 p-6 md:gap-24 md:p-10 lg:p-12">
${hero}

        <Separator />

${features}

        <Separator />

${quickStart}

${footer}
      </div>
    </main>
  )
}
`;
  }

  return `import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "../components/theme-toggle.js";

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
${header}

      <div className="mx-auto flex max-w-5xl flex-col gap-16 p-6 md:gap-24 md:p-10 lg:p-12">
${hero}

        <Separator />

${features}

        <Separator />

${quickStart}

${footer}
      </div>
    </main>
  );
}
`;
}
