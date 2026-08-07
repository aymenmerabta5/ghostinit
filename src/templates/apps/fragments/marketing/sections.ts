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

export function marketingHeaderFragment(router: RouterType): string {
  const githubStars = `<a href="https://github.com/aymenmerabta5/ghostinit" target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><span className="font-mono">★</span> GitHub</a>`;
  if (router === "tanstack") {
    return `      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">GhostInit</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">control plane</Badge>
          </Link>
          <div className="flex items-center gap-2">
            ${githubStars}
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/sign-up">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>`;
  }
  return `      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">GhostInit</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">control plane</Badge>
          </Link>
          <div className="flex items-center gap-2">
            ${githubStars}
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>`;
}

export function marketingHeroFragment(router: RouterType): string {
  const desc = router === "next" ? sharedHeroDescNext : sharedHeroDescTanStack;
  const badgeExtra = router === "tanstack" ? " • TanStack Start" : "";
  const ctas =
    router === "next"
      ? `          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Start building</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="https://github.com/ghostinit/ghostinit">View source</Link>
            </Button>
          </div>`
      : `          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/sign-up">Start building</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="https://github.com/ghostinit/ghostinit" target="_blank" rel="noreferrer">View source</a>
            </Button>
          </div>`;

  const versionBadges = router === "next" ? versionBadgesNext() : versionBadgesTanstack();

  return `        <section className="flex flex-col gap-8 pt-8 md:pt-16">
          <Badge variant="secondary" className="w-fit font-mono text-xs">Bun only • oRPC • Better Auth${badgeExtra}</Badge>
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-[3.75rem]">
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
              <span className="ml-2 font-mono text-xs text-muted-foreground">~/code — zsh</span>
            </div>
            <div className="p-4 font-mono text-sm leading-relaxed">
              <div className="text-muted-foreground">$ bunx ghostinit create my-app --billing stripe,chargily</div>
              <div className="text-foreground">✓ Scaffolded my-app in 1.2s — 216 files, 0 drift</div>
              <div className="text-muted-foreground">$ cd my-app && bun install && bun run dev</div>
              <div className="text-foreground">✓ Ready on http://localhost:3000 — <span className="text-primary">ghostinit check</span> passed</div>
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
      ? `Bun only. No npm fallback. Secret strength validation length 32+`
      : `Bun only. TanStack Start uses vite dev.`;

  return `        <section className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Quick start</h2>
            <p className="text-sm text-muted-foreground max-w-[65ch]">${desc}</p>
          </div>
          <div className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed">
${cmd}
          </div>
        </section>`;
}

export function marketingFooterFragment(router: RouterType): string {
  const links =
    router === "next"
      ? `              <Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Sign in</Link>
              <Link href="/billing" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Billing</Link>`
      : `              <Link to="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Sign in</Link>
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Dashboard</Link>`;

  return `        <footer className="flex flex-col gap-4 border-t pt-8">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">Built with shadcn + Base UI + Tailwind v4 • OKLCH paper + indigo ≤10%</span>
            <div className="flex gap-4 text-xs">
${links}
            </div>
          </div>
        </footer>`;
}
