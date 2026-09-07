// @allow-long 530: bounded TanStack dashboard component renderers preserve one control-plane surface
import { file, type TemplateFile } from "../../shared.js";

function headerContent(): string {
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { SignOutButton } from "../../components/sign-out-button.js";

export function DashboardHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("header.kicker")}</span>
          <span className="hidden items-center rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:inline-flex">{t("header.modeMonorepo")}</span>
        </div>
        <h1 className="font-sans text-2xl font-semibold tracking-display">{t("header.title")}</h1>
        <p className="max-w-[65ch] font-mono text-xs leading-relaxed text-muted-foreground">{t("header.description")}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground md:inline-flex"><span className="size-1.5 rounded-full bg-success" /> {t("header.systemLive")}</span>
        <Button variant="ghost" size="sm" render={<Link to="/settings" />} nativeButton={false}>{t("header.settings")}</Button>
        <SignOutButton />
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1"><span className="size-1.5 rounded-full bg-success" /> {t("header.environmentLocal")}</span>
      <span className="inline-flex items-center gap-1.5 rounded-md border bg-code px-2 py-1 text-code-foreground"><span className="text-muted-foreground">$</span> bunx ghostinit check</span>
      <span className="hidden text-muted-foreground sm:inline">— {t("header.checkHint")}</span>
    </div>
  </div>;
}
`;
}

function architectureCardContent(): string {
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

const LAYERS = [
  ["L1", "apps/web"],
  ["L2", "packages/api · oRPC"],
  ["L3", "domain · packages/core"],
  ["L4", "services · billing"],
  ["L5", "providers · SDKs"],
  ["L6", "database · config · kernel"],
] as const;

export function ArchitectureCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  const layerNames = ["architecture.layerUi", "architecture.layerTransport", "architecture.layerDomain", "architecture.layerCapabilities", "architecture.layerVendors", "architecture.layerSupporting"] as const;
  return <div className="overflow-hidden rounded-lg border bg-card md:col-span-8">
    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("architecture.title")}</span>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-success"><span className="size-1.5 rounded-full bg-success" /> {t("architecture.statusPass")}</span>
    </div>
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        {layerNames.map((name, index) => <span key={name} className="contents">
          <span className="rounded-md border bg-background px-2 py-1">{t(name)}</span>
          {index < layerNames.length - 1 ? <span className="text-muted-foreground rtl:rotate-180">→</span> : null}
        </span>)}
      </div>
      <div className="grid grid-cols-1 gap-1.5 font-mono text-xs">{LAYERS.map(([level, label], index) => <div key={level} className="flex items-center justify-between rounded-md border bg-code px-3 py-2">
        <span className="text-muted-foreground">{level}</span><span className="text-code-foreground">{label}</span><span className={index === 4 ? "size-1.5 rounded-full bg-muted-foreground" : "size-1.5 rounded-full bg-success"} />
      </div>)}</div>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{t("architecture.description")}</p>
    </div>
  </div>;
}
`;
}

function checksCardContent(): string {
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

const CHECKS = ["checks.architecture", "checks.typecheck", "checks.lint"] as const;

export function ChecksCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <div className="flex flex-col overflow-hidden rounded-lg border bg-card md:col-span-4">
    <div className="border-b px-4 py-3"><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("checks.title")}</span></div>
    <div className="flex flex-col gap-3 p-4">
      <div className="rounded-md border bg-code p-3 font-mono text-xs leading-relaxed">
        <div className="flex items-center justify-between text-code-foreground"><span><span className="text-muted-foreground">$</span> ghostinit check</span><span className="text-success">✓</span></div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]"><span className="rounded bg-success/15 px-2 py-0.5 text-success">{t("checks.blockers", { count: 0 })}</span><span className="rounded bg-success/15 px-2 py-0.5 text-success">{t("checks.highs", { count: 0 })}</span><span className="rounded bg-secondary px-2 py-0.5 text-muted-foreground">{t("checks.mediums", { count: 3 })}</span></div>
        <div className="mt-3 grid gap-1 text-[11px]">{CHECKS.map((name) => <div key={name} className="flex justify-between"><span className="text-muted-foreground">{t(name)}</span><span className="text-success">{t("checks.statusPass")}</span></div>)}</div>
      </div>
      <div className="rounded-md border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"><div className="font-medium text-foreground">{t("checks.nextSteps")}</div><div className="mt-1 flex flex-col gap-1"><span>$ bun run typecheck</span><span>$ bun run check</span></div></div>
      <Button variant="outline" size="sm" className="w-full justify-between" render={<Link to="/admin" />} nativeButton={false}>{t("checks.openAdmin")} <span aria-hidden className="rtl:rotate-180">→</span></Button>
    </div>
  </div>;
}
`;
}

function architectureStatusContent(): string {
  return `import type * as React from "react";
import { ArchitectureCard } from "./architecture-card";
import { ChecksCard } from "./checks-card";
export function ArchitectureStatus(): React.JSX.Element {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-12"><ArchitectureCard /><ChecksCard /></div>;
}
`;
}

function identityCardContent(hasBilling: boolean): string {
  const billingAction = hasBilling
    ? '<Button variant="outline" size="sm" render={<Link to="/billing" />} nativeButton={false}>{t("identity.billing")}</Button>'
    : "";
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import type { DashboardUser } from "./types";
export function IdentityCard({ user }: { user: DashboardUser }): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <div className="overflow-hidden rounded-lg border bg-card md:col-span-7"><div className="flex items-center justify-between gap-3 border-b px-4 py-3"><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.title")}</span><Badge variant="secondary" className="font-mono text-[11px] capitalize tracking-wide">{String(user.role ?? t("identity.roleFallback"))}</Badge></div><div className="flex flex-col gap-4 p-4">
    <div className="grid gap-3"><div className="flex flex-col gap-1"><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.emailLabel")}</span><span className="truncate font-mono text-sm tracking-tight">{String(user.email ?? "")}</span></div><div className="flex flex-col gap-1"><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("identity.nameLabel")}</span><span className="truncate font-mono text-sm">{String(user.name ?? t("identity.nameNotSet"))}</span></div></div>
    <p className="font-mono text-xs text-muted-foreground">{t("identity.signedInAs", { email: String(user.email ?? ""), name: String(user.name ?? t("identity.nameNotSet")) })}</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" render={<Link to="/settings" />} nativeButton={false}>{t("identity.editProfile")}</Button>${billingAction}<Button variant="outline" size="sm" render={<Link to="/admin" />} nativeButton={false}>{t("identity.admin")}</Button></div>
    <pre className="overflow-x-auto rounded-md border bg-code p-3 font-mono text-[11px] leading-relaxed text-code-foreground">// {t("identity.sessionComment")}{"\\n"}await auth.api.getSession({"({ headers })"})</pre>
  </div></div>;
}
`;
}

function actionsCardContent(hasBilling: boolean): string {
  const billingAction = hasBilling
    ? '<Button variant="outline" size="sm" className="justify-between" render={<Link to="/billing" />} nativeButton={false}>{t("actions.manageBilling")} {arrow}</Button>'
    : "";
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
export function ActionsCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  const arrow = <span aria-hidden className="rtl:rotate-180">→</span>;
  return <div className="flex flex-col overflow-hidden rounded-lg border bg-card md:col-span-5"><div className="border-b px-4 py-3"><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("actions.title")}</span></div><div className="flex flex-col gap-2 p-4">
    <Button variant="outline" size="sm" className="justify-between" render={<Link to="/settings" />} nativeButton={false}>{t("actions.security")} {arrow}</Button>
    ${billingAction}
    <Button variant="outline" size="sm" className="justify-between" render={<Link to="/dashboard" />} nativeButton={false}>{t("actions.backDashboard")} {arrow}</Button>
  </div><div className="mt-auto border-t bg-code p-3"><div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("actions.command")}</div><pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-code-foreground">$ bunx ghostinit sync{"\\n"}$ bunx ghostinit add module identity</pre></div></div>;
}
`;
}

function identityActionsContent(): string {
  return `import type * as React from "react";
import { ActionsCard } from "./actions-card";
import { IdentityCard } from "./identity-card";
import type { DashboardUser } from "./types";
export function IdentityActions({ user }: { user: DashboardUser }): React.JSX.Element {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-12"><IdentityCard user={user} /><ActionsCard /></div>;
}
`;
}

function modulesCardContent(hasBilling: boolean): string {
  const billingModule = hasBilling
    ? '  ["@repo/billing", "modules.billingDescription", true],\n'
    : "";
  const activeModules = hasBilling ? 5 : 4;
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
const MODULES = [
  ["@repo/ui", "modules.uiDescription", true],
  ["@repo/auth", "modules.authDescription", true],
  ["@repo/database", "modules.databaseDescription", true],
${billingModule}  ["apps/web", "modules.webDescription", true],
] as const;
export function ModulesCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <div className="overflow-hidden rounded-lg border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{t("modules.title")}</span><span className="font-mono text-[11px] text-muted-foreground">{t("modules.summary", { active: ${activeModules}, optional: 0 })}</span></div><div className="divide-y divide-border">
    {MODULES.map(([name, description, active]) => <div key={name} className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs"><span className="flex items-center gap-2"><span className={active ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground"} /> {name}</span><span className="hidden text-muted-foreground sm:inline">{t(description)}</span><span className={active ? "rounded border bg-success/10 px-2 py-0.5 text-[11px] text-success" : "rounded border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"}>{active ? t("modules.ok") : t("modules.optional")}</span></div>)}
  </div><div className="border-t bg-code p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"><span className="text-code-foreground">turbo.json</span> {t("modules.environmentSummary")}<pre className="mt-2 overflow-x-auto text-code-foreground">pipeline: check → ^check</pre></div></div>;
}
`;
}

function viewContent(): string {
  return `import type * as React from "react";
import { Separator } from "@/components/ui/separator";
import { ArchitectureStatus } from "./architecture-status";
import { DashboardHeader } from "./dashboard-header";
import { IdentityActions } from "./identity-actions";
import { ModulesCard } from "./modules-card";
import type { DashboardUser } from "./types";
export function DashboardView({ user }: { user: DashboardUser }): React.JSX.Element {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8"><DashboardHeader /><Separator /><ArchitectureStatus /><IdentityActions user={user} /><ModulesCard /></div>;
}
`;
}

function typesContent(): string {
  return `export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}
`;
}

export function tanstackDashboardFeatureFiles(hasBilling = true): TemplateFile[] {
  const root = "apps/web/src/features/dashboard";
  return [
    file(`${root}/types.ts`, typesContent()),
    file(`${root}/dashboard-header.tsx`, headerContent()),
    file(`${root}/architecture-card.tsx`, architectureCardContent()),
    file(`${root}/checks-card.tsx`, checksCardContent()),
    file(`${root}/architecture-status.tsx`, architectureStatusContent()),
    file(`${root}/identity-card.tsx`, identityCardContent(hasBilling)),
    file(`${root}/actions-card.tsx`, actionsCardContent(hasBilling)),
    file(`${root}/identity-actions.tsx`, identityActionsContent()),
    file(`${root}/modules-card.tsx`, modulesCardContent(hasBilling)),
    file(`${root}/dashboard-view.tsx`, viewContent()),
  ];
}

export function tanstackDashboardRouteContent(isConvex = false): string {
  return `import * as React from "react";
import { cache } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
${isConvex ? "" : 'import { getRequestHeaders } from "@tanstack/react-start/server";'}
import { getRequestUser } from "@repo/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardView } from "@/features/dashboard/dashboard-view";

const getCachedSession = cache(async () => {
  const user = await getRequestUser(${isConvex ? "" : "getRequestHeaders()"});
  return user ? { user } : null;
});
const getSessionFn = createServerFn({ method: "GET" }).handler(getCachedSession);

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (!session?.user) throw redirect({ to: "/sign-in" });
    return { session };
  },
  component: DashboardPage,
});

function DashboardPage(): React.JSX.Element {
  const { session } = Route.useRouteContext();
  return <main className="min-h-screen bg-background text-foreground"><React.Suspense fallback={<div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>}><DashboardView user={session.user} /></React.Suspense></main>;
}
`;
}
