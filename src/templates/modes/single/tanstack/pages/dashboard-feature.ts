// @allow-long 218: three small emitted dashboard components share one single-mode producer
import { file, type TemplateFile } from "../../../../shared.js";

function identityCardContent(hasBilling: boolean): string {
  const billingAction = hasBilling
    ? '<Button variant="outline" size="sm" render={<Link to="/billing" />} nativeButton={false}>{t("identity.billing")}</Button>'
    : "";
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}

export function DashboardIdentityCard({ user }: { user: DashboardUser }): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
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
        <Button variant="outline" size="sm" render={<Link to="/settings" />} nativeButton={false}>{t("identity.editProfile")}</Button>
        ${billingAction}
        <Button variant="outline" size="sm" render={<Link to="/admin" />} nativeButton={false}>{t("identity.admin")}</Button>
      </div></CardContent>
    </Card>
  );
}
`;
}

function quickActionsContent(hasBilling: boolean): string {
  const billingAction = hasBilling
    ? '<Button variant="outline" size="sm" render={<Link to="/billing" />} nativeButton={false}>{t("actions.manageBilling")}</Button>'
    : "";
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function DashboardQuickActions(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("single.quickActionsTitle")}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button variant="outline" size="sm" render={<Link to="/settings" />} nativeButton={false}>{t("actions.security")}</Button>
        ${billingAction}
      </CardContent>
    </Card>
  );
}
`;
}

function overviewContent(hasBilling: boolean): string {
  const billingAction = hasBilling
    ? '<Button variant="outline" size="sm" render={<Link to="/billing" />} nativeButton={false}>{t("single.billingTitle")}</Button>'
    : "";
  return `"use client";
import type * as React from "react";
import { Link } from "@tanstack/react-router";
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
            <Button variant="ghost" size="sm" render={<Link to="/settings" />} nativeButton={false}>{t("single.settingsTitle")}</Button>
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

export function singleDashboardRouteContent(isConvex = false): string {
  return `import type * as React from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
${isConvex ? "" : 'import { getRequestHeaders } from "@tanstack/react-start/server";'}
import { getRequestUser } from "@/server/auth";
import { DashboardOverview } from "@/features/dashboard/dashboard-overview";

const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getRequestUser(${isConvex ? "" : "getRequestHeaders()"});
  return user ? { user } : null;
});

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
  return <main className="min-h-screen bg-background text-foreground">
    <DashboardOverview user={session.user} />
  </main>;
}
`;
}

export function singleDashboardFeatureFilesTanstack(hasBilling = true): TemplateFile[] {
  return [
    file("src/features/dashboard/identity-card.tsx", identityCardContent(hasBilling)),
    file("src/features/dashboard/quick-actions.tsx", quickActionsContent(hasBilling)),
    file("src/features/dashboard/dashboard-overview.tsx", overviewContent(hasBilling)),
  ];
}
