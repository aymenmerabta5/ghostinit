type DashboardRouter = "next" | "tanstack";

function linkImport(router: DashboardRouter): string {
  return router === "next"
    ? 'import Link from "next/link";'
    : 'import { Link } from "@tanstack/react-router";';
}

export function dashboardUserTypesContent(): string {
  return `export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}
`;
}

export function dashboardAccountContent(
  router: DashboardRouter,
  hasAdminNavigation: boolean,
  name = "IdentityCard",
): string {
  const link = router === "next" ? "href" : "to";
  return `"use client";
import type * as React from "react";
${linkImport(router)}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { DashboardIdentityStatus } from "./identity-state";
import { useDashboardIdentity } from "./queries";
import type { DashboardUser } from "./types";

export function ${name}({ user: initialUser }: { user: DashboardUser }): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  const { user, pending, error } = useDashboardIdentity(initialUser);
  if (!user) return <DashboardIdentityStatus pending={pending} error={error} className="lg:col-span-7" />;
  const name = String(user.name || t("identity.nameNotSet"));
  const initials = String(user.name || user.email || "U").trim().split(/\\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  return <section className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-surface lg:col-span-7" aria-labelledby="dashboard-profile-title">
    <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
      <h2 id="dashboard-profile-title" className="text-base font-semibold tracking-tight">{t("single.profileTitle")}</h2>
      <Badge variant="secondary" className="shrink-0 capitalize">{String(user.role ?? t("identity.roleFallback"))}</Badge>
    </div>
    <div className="space-y-7 p-6 sm:p-8">
      <div className="flex min-w-0 items-center gap-4">
        <div aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">{initials}</div>
        <div className="min-w-0"><p className="break-words text-2xl font-semibold tracking-tight">{name}</p><p className="mt-1 break-all text-sm leading-6 text-muted-foreground">{String(user.email ?? "")}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" render={<Link ${link}="/settings" />} nativeButton={false}>{t("identity.editProfile")}</Button>
        ${hasAdminNavigation ? `{user.role === "admin" ? <Button variant="outline" size="sm" render={<Link ${link}="/admin" />} nativeButton={false}>{t("identity.admin")}</Button> : null}` : ""}
      </div>
    </div>
  </section>;
}
`;
}

export function dashboardActionsContent(
  router: DashboardRouter,
  hasBilling: boolean,
  name = "ActionsCard",
): string {
  const link = router === "next" ? "href" : "to";
  return `"use client";
import type * as React from "react";
${linkImport(router)}
import { ArrowUpRight, ShieldCheck${hasBilling ? ", CreditCard" : ""} } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

export function ${name}(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <section className="min-w-0 rounded-lg border bg-card p-6 shadow-surface lg:col-span-5" aria-labelledby="dashboard-actions-title">
    <h2 id="dashboard-actions-title" className="mb-5 text-base font-semibold tracking-tight">{t("actions.title")}</h2>
    <div className="divide-y">
      <Link ${link}="/settings" className="group flex min-h-20 items-center gap-3 rounded-lg py-4 text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ShieldCheck className="size-5" strokeWidth={1.75} aria-hidden /></span>
        <span className="min-w-0 flex-1">{t("actions.security")}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-rotate-90" aria-hidden />
      </Link>
      ${
        hasBilling
          ? `<Link ${link}="/billing" className="group flex min-h-20 items-center gap-3 rounded-lg py-4 text-sm font-medium outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><CreditCard className="size-5" strokeWidth={1.75} aria-hidden /></span>
        <span className="min-w-0 flex-1">{t("actions.manageBilling")}</span><ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-rotate-90" aria-hidden />
      </Link>`
          : ""
      }
    </div>
  </section>;
}
`;
}
