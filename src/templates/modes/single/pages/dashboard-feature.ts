import { file, type TemplateFile } from "../../../shared.js";
import {
  dashboardIdentityQueriesContent,
  dashboardIdentityStateContent,
} from "../../../apps/fragments/dashboard-identity.js";
import {
  dashboardAccountContent,
  dashboardActionsContent,
  dashboardUserTypesContent,
} from "../../../apps/fragments/dashboard-account.js";

type DashboardRouter = "next" | "tanstack";

function overviewContent(): string {
  return `"use client";
import type * as React from "react";
import { DashboardIdentityCard } from "./components/identity-card";
import type { DashboardUser } from "./types";
import { useDashboardIdentity } from "./queries";
import { DashboardQuickActions } from "./components/quick-actions";
import { useSurfaceTranslations } from "@/lib/translations";

export function DashboardOverview({ user }: { user: DashboardUser }): React.JSX.Element {
  const identity = useDashboardIdentity(user);
  const t = useSurfaceTranslations("dashboard");
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <div className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1><p className="max-w-[60ch] text-sm leading-6 text-muted-foreground">{t("single.description")}</p></div>
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12"><DashboardIdentityCard {...identity} /><DashboardQuickActions /></div>
  </div>;
}
`;
}

export function singleDashboardFeatureFiles(
  router: DashboardRouter,
  hasBilling: boolean,
  hasAdminNavigation: boolean,
): TemplateFile[] {
  const root = "src/features/dashboard";
  return [
    file(`${root}/types.ts`, dashboardUserTypesContent()),
    file(`${root}/queries.ts`, dashboardIdentityQueriesContent()),
    file(`${root}/components/identity-state.tsx`, dashboardIdentityStateContent()),
    file(
      `${root}/components/identity-card.tsx`,
      dashboardAccountContent(router, hasAdminNavigation, "DashboardIdentityCard"),
    ),
    file(
      `${root}/components/quick-actions.tsx`,
      dashboardActionsContent(router, hasBilling, "DashboardQuickActions"),
    ),
    file(`${root}/dashboard-overview.tsx`, overviewContent()),
  ];
}
