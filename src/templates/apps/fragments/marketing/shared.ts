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

export const sharedHeroTitle = `Opinionated modular monolith that scales with you`;

export const sharedHeroDescNext = `Next.js App Router, Drizzle, oRPC contract-first, Better Auth, flexible billing. Two modes: monorepo workspaces or flat single. Webhooks via Next.js routes raw Buffer, single port.`;

export const sharedHeroDescTanStack = `TanStack Start, Drizzle, oRPC contract-first, Better Auth, flexible billing. Single port 3000, OKLCH paper tokens.`;

export const sharedWhyHeader = `<div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Why GhostInit</h2>
            <p className="max-w-[60ch] text-sm text-muted-foreground">GhostInit Layered Architecture (UI-&gt;Supporting, inspired by DDD), capability services, pure oRPC. No boilerplate sprawl.</p>
          </div>`;

export const sharedFeatureCardsNext = `            <Card className="md:col-span-7">
              <CardHeader>
                <CardTitle className="text-base">Modular monolith with GhostInit Layered Architecture</CardTitle>
                <CardDescription className="max-w-[60ch]">Bounded contexts per module, domain purity, application layer commands queries, build-time enforced layers. Sync keeps registries deterministic.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">modules</Badge>
                  <Badge variant="secondary">services</Badge>
                  <Badge variant="secondary">API contract</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5">
              <CardHeader>
                <CardTitle className="text-base">Pure oRPC only</CardTitle>
                <CardDescription>Single port 3000, no Eden Treaty duplication. Webhooks via Next routes raw Buffer.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">RPCHandler + Buffer.from(await request.arrayBuffer())</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5">
              <CardHeader>
                <CardTitle className="text-base">Flexible billing</CardTitle>
                <CardDescription>Any combo: none, one, multi, all. Stripe, Chargily EDAHABIA, Paddle MoR, Polar license keys. Shared DB tables idempotent.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="md:col-span-7">
              <CardHeader>
                <CardTitle className="text-base">Dual modes unified</CardTitle>
                <CardDescription className="max-w-[60ch]">Monorepo workspaces apps/* packages/* or flat single src/app + server/. Same design tokens, same shell, same oRPC client. OKLCH tinted neutrals chroma 0.005-0.01 paper white.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> monorepo</span></Badge>
                  <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> single</span></Badge>
                </div>
              </CardContent>
            </Card>`;

export const sharedFeatureCardsTanStack = `            <Card className="md:col-span-7">
              <CardHeader>
                <CardTitle className="text-base">Modular monolith with GhostInit Layered Architecture</CardTitle>
                <CardDescription className="max-w-[60ch]">Bounded contexts per module, domain purity, application layer commands queries, build-time enforced layers.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">modules</Badge>
                  <Badge variant="secondary">services</Badge>
                  <Badge variant="secondary">API contract</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-5">
              <CardHeader>
                <CardTitle className="text-base">Pure oRPC only</CardTitle>
                <CardDescription>Single port 3000, no Treaty duplication. Webhooks via Start server routes raw Buffer.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">RPCHandler + Buffer.from(await request.arrayBuffer())</p>
              </CardContent>
            </Card>

            <Card className="md:col-span-5">
              <CardHeader>
                <CardTitle className="text-base">Flexible billing</CardTitle>
                <CardDescription>Any combo: none, one, multi, all. Stripe, Chargily EDAHABIA, Paddle MoR, Polar license keys.</CardDescription>
              </CardHeader>
            </Card>

            <Card className="md:col-span-7">
              <CardHeader>
                <CardTitle className="text-base">Dual frameworks</CardTitle>
                <CardDescription className="max-w-[60ch]">Next.js or TanStack Start. Same tokens, same oRPC, same OKLCH tinted neutrals chroma 0.005.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> nextjs</span></Badge>
                  <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> tanstack-start</span></Badge>
                </div>
              </CardContent>
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
