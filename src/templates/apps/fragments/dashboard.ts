// @allow-long 336: dashboard fragments DDD control plane tiles shared Next/TanStack
/**
 * Dashboard fragments – control plane (t3.codes inspired)
 * Dark-first, terminal-native, high-contrast, dense but scannable
 * Tiles: border bg-card no shadow, code blocks font-mono, tight tracking DM Sans + JetBrains Mono
 * Shared between Next and TanStack – only Link syntax diverges
 */

export type RouterType = "next" | "tanstack";

/**
 * Legacy grid kept for backwards compat – now uses Tile pattern (border bg-card, no shadow)
 * not generic shadcn Card shadow. Kept as export so external consumers don't break.
 */
export const sharedDashboardGrid = `        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-7 rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.title")}</span>
              <Badge variant="secondary" className="capitalize font-mono text-[11px]"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" /> {session.user.role ?? t("identity.roleFallback")}</span></Badge>
            </div>
            <div className="p-4">
              <p className="font-mono text-xs text-muted-foreground max-w-[60ch]">{t("identity.signedInAs", { email: session.user.email, name: session.user.name ?? t("identity.nameNotSet") })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" render={<Link href="/settings" />} nativeButton={false} aria-label={t("identity.editProfile")}>{t("identity.editProfile")}</Button>
                <Button variant="outline" size="sm" render={<Link href="/billing" />} nativeButton={false} aria-label={t("identity.billing")}>{t("identity.billing")}</Button>
                <Button variant="outline" size="sm" render={<Link href="/admin" />} nativeButton={false} aria-label={t("identity.admin")}>{t("identity.admin")}</Button>
              </div>
            </div>
          </div>
          <div className="md:col-span-5 rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("actions.title")}</span>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Button variant="outline" size="sm" className="justify-between" render={<Link href="/settings" />} nativeButton={false} aria-label={t("actions.security")}>{t("actions.security")} <span aria-hidden>→</span></Button>
              <Button variant="outline" size="sm" className="justify-between" render={<Link href="/billing" />} nativeButton={false} aria-label={t("actions.manageBilling")}>{t("actions.manageBilling")} <span aria-hidden>→</span></Button>
            </div>
          </div>
        </div>`;

export function dashboardInnerContent(router: RouterType): string {
  const toSettings = router === "tanstack" ? 'to="/settings"' : 'href="/settings"';
  const toBilling = router === "tanstack" ? 'to="/billing"' : 'href="/billing"';
  const toAdmin = router === "tanstack" ? 'to="/admin"' : 'href="/admin"';
  const toDashboard = router === "tanstack" ? 'to="/dashboard"' : 'href="/dashboard"';
  const nameExpr =
    router === "tanstack"
      ? '{String(user?.name ?? t("identity.nameNotSet"))}'
      : '{session.user.name ?? t("identity.nameNotSet")}';
  const emailExpr = router === "tanstack" ? "{String(user?.email ?? '')}" : "{session.user.email}";
  const roleExpr =
    router === "tanstack"
      ? '{String(user?.role ?? t("identity.roleFallback"))}'
      : '{session.user.role ?? t("identity.roleFallback")}';
  const signedInExpr =
    router === "tanstack"
      ? '{t("identity.signedInAs", { email: String(user?.email ?? ""), name: String(user?.name ?? t("identity.nameNotSet")) })}'
      : '{t("identity.signedInAs", { email: session.user.email, name: session.user.name ?? t("identity.nameNotSet") })}';
  const thirdAction =
    router === "tanstack"
      ? `<Button variant="outline" size="sm" className="justify-between" render={<Link ${toDashboard} />} nativeButton={false} aria-label={t("actions.backDashboard")}>{t("actions.backDashboard")} <span aria-hidden>→</span></Button>`
      : `<Button variant="outline" size="sm" className="justify-between" render={<Link ${toAdmin} />} nativeButton={false} aria-label={t("actions.admin")}>{t("actions.admin")} <span aria-hidden>→</span></Button>`;

  return `        {/* control plane header — mono label + live dot, tight tracking */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-success animate-pulse" aria-hidden />
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("header.kicker")}</span>
                <span className="hidden sm:inline-flex items-center rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t("header.modeMonorepo")}</span>
              </div>
              <h1 className="font-sans text-2xl font-semibold tracking-display">{t("header.title")}</h1>
              <p className="font-mono text-xs leading-relaxed text-muted-foreground max-w-[65ch]">{t("header.description")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-success" /> {t("header.systemLive")}</span>
              <Button variant="ghost" size="sm" render={<Link ${toSettings} />} nativeButton={false} aria-label={t("header.settings")}>{t("header.settings")}</Button>
              <SignOutButton />
            </div>
          </div>
          {/* env + command hint — terminal native */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1"><span className="size-1.5 rounded-full bg-success" /> {t("header.environmentLocal")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-code px-2 py-1 text-code-foreground"><span className="text-muted-foreground">$</span> bunx ghostinit check</span>
            <span className="hidden sm:inline text-muted-foreground">— {t("header.checkHint")}</span>
          </div>
        </div>

        <Separator />

        {/* row 1: architecture layers (8) + checks (4) — dense, scannable */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-8 rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("architecture.title")}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-success"><span className="size-1.5 rounded-full bg-success" /> {t("architecture.statusPass")}</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                <span className="rounded-md border bg-background px-2 py-1">{t("architecture.layerUi")}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">{t("architecture.layerTransport")}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">{t("architecture.layerDomain")}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">{t("architecture.layerCapabilities")}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">{t("architecture.layerVendors")}</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">{t("architecture.layerSupporting")}</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 font-mono text-xs">
                <div className="flex items-center justify-between rounded-md border bg-code px-3 py-2"><span className="text-muted-foreground">L1</span><span className="text-code-foreground">apps/web</span><span className="size-1.5 rounded-full bg-success" /></div>
                <div className="flex items-center justify-between rounded-md border bg-code px-3 py-2"><span className="text-muted-foreground">L2</span><span className="text-code-foreground">packages/api · oRPC</span><span className="size-1.5 rounded-full bg-success" /></div>
                <div className="flex items-center justify-between rounded-md border bg-code px-3 py-2"><span className="text-muted-foreground">L3</span><span className="text-code-foreground">domain · packages/core</span><span className="size-1.5 rounded-full bg-success" /></div>
                <div className="flex items-center justify-between rounded-md border bg-code px-3 py-2"><span className="text-muted-foreground">L4</span><span className="text-code-foreground">services · billing</span><span className="size-1.5 rounded-full bg-success" /></div>
                <div className="flex items-center justify-between rounded-md border bg-code px-3 py-2"><span className="text-muted-foreground">L5</span><span className="text-code-foreground">providers · SDKs</span><span className="size-1.5 rounded-full bg-muted-foreground" /></div>
                <div className="flex items-center justify-between rounded-md border bg-code px-3 py-2"><span className="text-muted-foreground">L6</span><span className="text-code-foreground">database · config · kernel</span><span className="size-1.5 rounded-full bg-success" /></div>
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{t("architecture.description")}</p>
            </div>
          </div>

          <div className="md:col-span-4 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("checks.title")}</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="rounded-md border bg-code p-3 font-mono text-xs leading-relaxed">
                <div className="flex items-center justify-between text-code-foreground"><span><span className="text-muted-foreground">$</span> ghostinit check</span><span className="text-success">✓</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded bg-success/15 px-2 py-0.5 text-success">{t("checks.blockers", { count: 0 })}</span>
                  <span className="rounded bg-success/15 px-2 py-0.5 text-success">{t("checks.highs", { count: 0 })}</span>
                  <span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">{t("checks.mediums", { count: 3 })}</span>
                </div>
                <div className="mt-3 grid gap-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("checks.architecture")}</span><span className="text-success">{t("checks.statusPass")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("checks.typecheck")}</span><span className="text-success">{t("checks.statusPass")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("checks.lint")}</span><span className="text-success">{t("checks.statusPass")}</span></div>
                </div>
              </div>
              <div className="rounded-md border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <div className="text-foreground font-medium">{t("checks.nextSteps")}</div>
                <div className="mt-1 flex flex-col gap-1">
                  <span><span className="text-muted-foreground">$</span> bun run typecheck</span>
                  <span><span className="text-muted-foreground">$</span> bun run check</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full justify-between" render={<Link ${toAdmin} />} nativeButton={false} aria-label={t("checks.openAdmin")}>{t("checks.openAdmin")} <span aria-hidden>→</span></Button>
            </div>
          </div>
        </div>

        {/* row 2: identity (7) + ops / quick actions (5) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-7 rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.title")}</span>
              <Badge variant="secondary" className="capitalize font-mono text-[11px] tracking-wide"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" /> ${roleExpr}</span></Badge>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.emailLabel")}</span>
                  <span className="font-mono text-sm truncate tracking-tight">${emailExpr}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.nameLabel")}</span>
                  <span className="font-mono text-sm truncate">${nameExpr}</span>
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">${signedInExpr}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" render={<Link ${toSettings} />} nativeButton={false} aria-label={t("identity.editProfile")}>{t("identity.editProfile")}</Button>
                <Button variant="outline" size="sm" render={<Link ${toBilling} />} nativeButton={false} aria-label={t("identity.billing")}>{t("identity.billing")}</Button>
                <Button variant="outline" size="sm" render={<Link ${toAdmin} />} nativeButton={false} aria-label={t("identity.admin")}>{t("identity.admin")}</Button>
              </div>
              <pre className="overflow-x-auto rounded-md border bg-code p-3 font-mono text-[11px] leading-relaxed text-code-foreground"><span className="text-muted-foreground">// {t("identity.sessionComment")}</span>{"\\n"}<span className="text-muted-foreground">await</span> auth<span className="text-muted-foreground">.</span>api<span className="text-muted-foreground">.</span>getSession<span className="text-muted-foreground">({"{"} headers {"}"})</span></pre>
            </div>
          </div>

          <div className="md:col-span-5 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("actions.title")}</span>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Button variant="outline" size="sm" className="justify-between" render={<Link ${toSettings} />} nativeButton={false} aria-label={t("actions.security")}>{t("actions.security")} <span aria-hidden>→</span></Button>
              <Button variant="outline" size="sm" className="justify-between" render={<Link ${toBilling} />} nativeButton={false} aria-label={t("actions.manageBilling")}>{t("actions.manageBilling")} <span aria-hidden>→</span></Button>
              ${thirdAction}
            </div>
            <div className="mt-auto border-t bg-code p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("actions.command")}</div>
              <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-code-foreground"><span className="text-muted-foreground">$</span> bunx ghostinit sync{"\\n"}<span className="text-muted-foreground">$</span> bunx ghostinit add module identity</pre>
            </div>
          </div>
        </div>

        {/* row 3: modules — dense list with status dots, terminal-native */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("modules.title")}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{t("modules.summary", { active: 4, optional: 1 })}</span>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" /> @repo/ui</span>
              <span className="hidden sm:inline text-muted-foreground">{t("modules.uiDescription")}</span>
              <span className="rounded border bg-success/10 px-2 py-0.5 text-[11px] text-success">{t("modules.ok")}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" /> @repo/auth</span>
              <span className="hidden sm:inline text-muted-foreground">{t("modules.authDescription")}</span>
              <span className="rounded border bg-success/10 px-2 py-0.5 text-[11px] text-success">{t("modules.ok")}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" /> @repo/database</span>
              <span className="hidden sm:inline text-muted-foreground">{t("modules.databaseDescription")}</span>
              <span className="rounded border bg-success/10 px-2 py-0.5 text-[11px] text-success">{t("modules.ok")}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-muted-foreground" /> @repo/billing</span>
              <span className="hidden sm:inline text-muted-foreground">{t("modules.billingDescription")}</span>
              <span className="rounded border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{t("modules.optional")}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-success" /> apps/web</span>
              <span className="hidden sm:inline text-muted-foreground">{t("modules.webDescription")}</span>
              <span className="rounded border bg-success/10 px-2 py-0.5 text-[11px] text-success">{t("modules.ok")}</span>
            </div>
          </div>
          <div className="border-t bg-code p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-code-foreground">turbo.json</span> <span className="text-muted-foreground">{t("modules.environmentSummary")}</span>
            <pre className="mt-2 overflow-x-auto text-code-foreground">{"{"} <span className="text-muted-foreground">"pipeline": {"{"} "check": {"{"} "dependsOn": ["^check"] {"}"} {"}"}</span> {"}"}</pre>
          </div>
        </div>`;
}
export function dashboardPageContent(router: RouterType, isConvex = false): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { cache } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
${isConvex ? "" : "import { getRequestHeaders } from '@tanstack/react-start/server'"}
import { getRequestUser } from '@repo/auth'
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from '../components/sign-out-button.js'
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";

const getCachedSession = cache(async () => {
  const user = await getRequestUser(${isConvex ? "" : "getRequestHeaders()"})
  return user ? { user } : null
})

const getSessionFn = createServerFn({ method: 'GET' }).handler(getCachedSession)

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/sign-in' })
    }
    return { session }
  },
  component: DashboardPage,
})

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function DashboardPage(): React.JSX.Element {
  const { session } = Route.useRouteContext()
  const user = session?.user
  const t = useSurfaceTranslations("dashboard")

  return (
    <main className="min-h-screen bg-background text-foreground">
      <React.Suspense fallback={<DashboardSkeleton />}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
${dashboardInnerContent("tanstack")}
        </div>
      </React.Suspense>
    </main>
  )
}
`;
  }
  return `import * as React from "react";
import { cache } from "react";
import { Suspense } from "react";
${isConvex ? "" : 'import { headers } from "next/headers";'}
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestUser } from "@repo/auth";
import { SignOutButton } from "../../components/sign-out-button.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getSurfaceTranslations } from "@/lib/translations.server";

export const getCachedSession = cache(async () => {
  const user = await getRequestUser(${isConvex ? "" : "await headers()"});
  return user ? { user } : null;
});

async function DashboardContent(): Promise<React.JSX.Element> {
  const [session, t] = await Promise.all([
    getCachedSession(),
    getSurfaceTranslations("dashboard"),
  ]);
  if (!session?.user) {
    redirect("/sign-in");
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
${dashboardInnerContent("next")}
    </div>
  );
}

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
`;
}

export const sharedSettingsNav = [
  { label: "Settings", href: "/settings", to: "/settings" },
  { label: "Billing", href: "/billing", to: "/billing" },
  { label: "Admin", href: "/admin", to: "/admin" },
];
