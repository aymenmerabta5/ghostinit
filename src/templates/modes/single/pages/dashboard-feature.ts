import { file, type TemplateFile } from "../../../shared.js";
import { dashboardIdentityStateContent } from "../../../apps/fragments/dashboard-identity.js";

type DashboardRouter = "next" | "tanstack";

function navigation(router: DashboardRouter) {
  return router === "next"
    ? { linkImport: 'import Link from "next/link";', linkProperty: "href" }
    : { linkImport: 'import { Link } from "@tanstack/react-router";', linkProperty: "to" };
}

function identityCardContent(
  router: DashboardRouter,
  hasBilling: boolean,
  hasAdminNavigation: boolean,
): string {
  const { linkImport, linkProperty } = navigation(router);
  const billingAction = hasBilling
    ? `<Button variant="outline" size="sm" render={<Link ${linkProperty}="/billing" />} nativeButton={false}>{t("identity.billing")}</Button>`
    : "";
  return `"use client";
import type * as React from "react";
${linkImport}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { DashboardIdentityStatus, useDashboardIdentity } from "./identity-state";

export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}

export function DashboardIdentityCard({ user: initialUser }: { user: DashboardUser }): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  const { user, pending, error } = useDashboardIdentity(initialUser);
  if (!user) return <DashboardIdentityStatus pending={pending} error={error} className="md:col-span-2" />;
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{t("single.profileTitle")}</CardTitle>
          <Badge variant="secondary" className="capitalize">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" />
              {String(user.role ?? t("identity.roleFallback"))}
            </span>
          </Badge>
        </div>
        <CardDescription className="max-w-[60ch]">
          {t("identity.signedInAs", {
            email: String(user.email ?? ""),
            name: String(user.name ?? t("identity.nameNotSet")),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent><div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<Link ${linkProperty}="/settings" />} nativeButton={false}>{t("identity.editProfile")}</Button>
        ${billingAction}
        ${hasAdminNavigation ? `{user.role === "admin" ? <Button variant="outline" size="sm" render={<Link ${linkProperty}="/admin" />} nativeButton={false}>{t("identity.admin")}</Button> : null}` : ""}
      </div></CardContent>
    </Card>
  );
}
`;
}

function quickActionsContent(router: DashboardRouter, hasBilling: boolean): string {
  const { linkImport, linkProperty } = navigation(router);
  const billingAction = hasBilling
    ? `<Button variant="outline" size="sm" render={<Link ${linkProperty}="/billing" />} nativeButton={false}>{t("actions.manageBilling")}</Button>`
    : "";
  return `"use client";
import type * as React from "react";
${linkImport}
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function DashboardQuickActions(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("single.quickActionsTitle")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" size="sm" render={<Link ${linkProperty}="/settings" />} nativeButton={false}>{t("actions.security")}</Button>
        ${billingAction}
      </CardContent>
    </Card>
  );
}
`;
}

function overviewContent(router: DashboardRouter, hasBilling: boolean): string {
  const { linkImport, linkProperty } = navigation(router);
  const billingAction = hasBilling
    ? `<Button variant="outline" size="sm" render={<Link ${linkProperty}="/billing" />} nativeButton={false}>{t("single.billingTitle")}</Button>`
    : "";
  return `"use client";
import type * as React from "react";
${linkImport}
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DashboardIdentityCard, type DashboardUser } from "./identity-card";
import { DashboardQuickActions } from "./quick-actions";
import { useSurfaceTranslations } from "@/lib/translations";

export function DashboardOverview({ user }: { user: DashboardUser }): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8 lg:p-10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link ${linkProperty}="/settings" />} nativeButton={false}>{t("single.settingsTitle")}</Button>
            ${billingAction}
          </div>
        </div>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t("single.description")}</p>
      </div>
      <Separator />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <DashboardIdentityCard user={user} />
        <DashboardQuickActions />
      </div>
    </div>
  );
}
`;
}

export function singleDashboardFeatureFiles(
  router: DashboardRouter,
  hasBilling: boolean,
  hasAdminNavigation: boolean,
): TemplateFile[] {
  return [
    file("src/features/dashboard/identity-state.tsx", dashboardIdentityStateContent()),
    file(
      "src/features/dashboard/identity-card.tsx",
      identityCardContent(router, hasBilling, hasAdminNavigation),
    ),
    file("src/features/dashboard/quick-actions.tsx", quickActionsContent(router, hasBilling)),
    file("src/features/dashboard/dashboard-overview.tsx", overviewContent(router, hasBilling)),
  ];
}
