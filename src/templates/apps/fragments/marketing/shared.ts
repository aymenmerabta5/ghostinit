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

export const sharedHeroTitle = `The open-source<br />control plane<br />for your monorepo.`;

export const sharedHeroDescNext = `Orchestrate Next.js, Drizzle, oRPC, Better Auth from one surface. Bring your own billing. Fork the whole thing.`;

export const sharedHeroDescTanStack = `Orchestrate TanStack Start, Drizzle, oRPC, Better Auth from one surface. Bring your own stack. Fork the whole thing.`;

export const sharedWhyHeader = `<div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Why GhostInit</h2>
            <p className="max-w-[60ch] text-sm text-muted-foreground">A well-structured monorepo with architectural linting that doesn't fight you. Like t3.codes for your app.</p>
          </div>`;

export const sharedFeatureCardsNext = `            <Card className="md:col-span-7 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">One command to scaffold</CardTitle>
                <CardDescription className="max-w-[60ch]">Every thread writes to its own branch. When it's good, one button opens the PR. No terminal dance.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">bunx ghostinit create my-app --billing stripe,chargily<br />cd my-app && bun install && bun run dev</div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Pure oRPC only</CardTitle>
                <CardDescription>Single port 3000. Webhooks via Next routes raw Buffer.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">RPCHandler + Buffer.from(await request.arrayBuffer())</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Flexible billing</CardTitle>
                <CardDescription>Any combo: Stripe, Chargily, Paddle, Polar. Shared tables, idempotent webhooks.</CardDescription>
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
                <CardTitle className="text-base">If you don't like it, fork it</CardTitle>
                <CardDescription className="max-w-[60ch]">MIT licensed. Change the UI, add a provider, ship your own build. Like t3.codes.</CardDescription>
              </CardHeader>
              <CardContent className="rounded-md bg-muted p-3 font-mono text-xs">gh repo fork aymenmerabta5/ghostinit --clone<br />cd ghostinit && bun install && bun run dev</CardContent>
            </Card>`;

export const sharedFeatureCardsTanStack = `            <Card className="md:col-span-7 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">One command to scaffold</CardTitle>
                <CardDescription className="max-w-[60ch]">TanStack Start + Vite, same oRPC, same tokens. One surface.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">bunx ghostinit create my-app --framework tanstack-start<br />cd my-app && bun install && bun run dev</div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Pure oRPC only</CardTitle>
                <CardDescription>Single port 3000. Webhooks via Start server routes.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">createServerFn + getRequestHeaders</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5 border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Flexible billing</CardTitle>
                <CardDescription>Any combo: Stripe, Chargily, Paddle, Polar.</CardDescription>
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
                <CardTitle className="text-base">If you don't like it, fork it</CardTitle>
                <CardDescription className="max-w-[60ch]">MIT. Change the UI, add an agent, ship your own build.</CardDescription>
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
    heroBadge: `Bun only • oRPC • Better Auth`,
    heroTitle: sharedHeroTitle,
    features: sharedWhyHeader,
    quickStartTitle: `Quick start`,
    footerTagline: `Built with shadcn + Base UI + Tailwind v4 • OKLCH paper + indigo ≤10%`,
  };
}
