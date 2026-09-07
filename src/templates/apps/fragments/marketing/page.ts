/** Marketing route orchestrator. Section implementations are emitted as focused components. */
import type { RouterType } from "./shared.js";

export function buildMarketingPageContent(router: RouterType): string {
  const imports = `import { Separator } from "@/components/ui/separator";
import { MarketingFeatures } from "@/components/marketing/features";
import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingQuickStart } from "@/components/marketing/quick-start";`;

  if (router === "tanstack") {
    return `import type * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
${imports}

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 p-6 md:gap-24 md:p-10 lg:p-12">
        <MarketingHero />
        <Separator />
        <MarketingFeatures />
        <Separator />
        <MarketingQuickStart />
        <MarketingFooter />
      </div>
    </main>
  );
}
`;
  }

  return `import type * as React from "react";
import { Suspense } from "react";
${imports}

function MarketingSectionFallback(): React.JSX.Element {
  return <div className="h-40 w-full animate-pulse rounded-xl bg-muted/40" aria-hidden="true" />;
}

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 p-6 md:gap-24 md:p-10 lg:p-12">
        <Suspense fallback={<MarketingSectionFallback />}><MarketingHero /></Suspense>
        <Separator />
        <Suspense fallback={<MarketingSectionFallback />}><MarketingFeatures /></Suspense>
        <Separator />
        <Suspense fallback={<MarketingSectionFallback />}><MarketingQuickStart /></Suspense>
        <Suspense fallback={<MarketingSectionFallback />}><MarketingFooter /></Suspense>
      </div>
    </main>
  );
}
`;
}
