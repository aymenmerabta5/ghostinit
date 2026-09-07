/** Marketing route orchestrator. Section implementations are emitted as focused components. */
import type { RouterType } from "./shared.js";

export function buildMarketingPageContent(router: RouterType): string {
  const imports = `import { MarketingFeatures } from "@/components/marketing/features";
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
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-5 pt-6 sm:px-8 md:gap-20 lg:px-10">
        <MarketingHero />
        <MarketingFeatures />
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
  return <div className="h-40 w-full rounded-xl bg-muted/40 motion-safe:animate-pulse" aria-hidden="true" />;
}

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-16 px-5 pt-6 sm:px-8 md:gap-20 lg:px-10">
        <Suspense fallback={<MarketingSectionFallback />}><MarketingHero /></Suspense>
        <Suspense fallback={<MarketingSectionFallback />}><MarketingFeatures /></Suspense>
        <Suspense fallback={<MarketingSectionFallback />}><MarketingQuickStart /></Suspense>
        <Suspense fallback={<MarketingSectionFallback />}><MarketingFooter /></Suspense>
      </div>
    </main>
  );
}
`;
}
