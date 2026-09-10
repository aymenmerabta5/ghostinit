import { file, type TemplateFile } from "../../shared.js";
import {
  dashboardIdentityQueriesContent,
  dashboardIdentityStateContent,
} from "./dashboard-identity.js";
import {
  dashboardAccountContent,
  dashboardActionsContent,
  dashboardUserTypesContent,
} from "./dashboard-account.js";
import {
  architectureCardContent,
  checksCardContent,
  modulesCardContent,
} from "./dashboard-guide.js";

function headerContent(): string {
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

export function DashboardHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">{t("header.title")}</h1><p className="max-w-[60ch] text-sm leading-6 text-muted-foreground">{t("single.description")}</p></div>
    <a href="#project-guide" className="rounded-md text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("header.setupGuide")}</a>
  </div>;
}
`;
}

function architectureStatusContent(): string {
  return `import type * as React from "react";
import { ArchitectureCard } from "./architecture-card";
import { ChecksCard } from "./checks-card";
import type { DashboardUser } from "../types";

export function ArchitectureStatus({ user }: { user: DashboardUser | null | undefined }): React.JSX.Element {
  return <div className="grid grid-cols-1 gap-8 lg:grid-cols-12"><ArchitectureCard /><ChecksCard user={user} /></div>;
}
`;
}

function identityActionsContent(): string {
  return `import type * as React from "react";
import { ActionsCard } from "./actions-card";
import { IdentityCard } from "./identity-card";
import type { DashboardIdentityState } from "../types";

export function IdentityActions({ identity }: { identity: DashboardIdentityState }): React.JSX.Element {
  return <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12"><IdentityCard {...identity} /><ActionsCard /></div>;
}
`;
}

function viewContent(): string {
  return `"use client";
import type * as React from "react";
import { ChevronDown } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { ArchitectureStatus } from "./components/architecture-status";
import { DashboardHeader } from "./components/dashboard-header";
import { IdentityActions } from "./components/identity-actions";
import { ModulesCard } from "./components/modules-card";
import type { DashboardUser } from "./types";
import { useDashboardIdentity } from "./queries";

export function DashboardView({ user }: { user: DashboardUser }): React.JSX.Element {
  const identity = useDashboardIdentity(user);
  const t = useSurfaceTranslations("dashboard");
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <DashboardHeader />
    <IdentityActions identity={identity} />
    <details id="project-guide" className="group scroll-mt-24 rounded-lg border bg-card shadow-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg p-6 text-base font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {t("header.setupGuide")}<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-7 border-t p-6 sm:p-8"><ArchitectureStatus user={identity.user} /><ModulesCard /></div>
    </details>
  </div>;
}
`;
}

export function tanstackDashboardFeatureFiles(
  hasBilling = true,
  hasAdminNavigation = true,
): TemplateFile[] {
  const root = "apps/web/src/features/dashboard";
  return [
    file(`${root}/types.ts`, dashboardUserTypesContent()),
    file(`${root}/queries.ts`, dashboardIdentityQueriesContent()),
    file(`${root}/components/identity-state.tsx`, dashboardIdentityStateContent()),
    file(`${root}/components/dashboard-header.tsx`, headerContent()),
    file(`${root}/components/architecture-card.tsx`, architectureCardContent()),
    file(`${root}/components/checks-card.tsx`, checksCardContent(hasAdminNavigation)),
    file(`${root}/components/architecture-status.tsx`, architectureStatusContent()),
    file(
      `${root}/components/identity-card.tsx`,
      dashboardAccountContent("tanstack", hasAdminNavigation),
    ),
    file(`${root}/components/actions-card.tsx`, dashboardActionsContent("tanstack", hasBilling)),
    file(`${root}/components/identity-actions.tsx`, identityActionsContent()),
    file(`${root}/components/modules-card.tsx`, modulesCardContent(hasBilling)),
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
  return <main className="min-h-[calc(100dvh-4rem)] bg-background text-foreground"><React.Suspense fallback={<div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>}><DashboardView user={session.user} /></React.Suspense></main>;
}
`;
}
