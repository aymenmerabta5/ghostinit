import type { TemplateFile } from "../../../../shared.js";
import { singleDashboardFeatureFiles } from "../../pages/dashboard-feature.js";

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
  return <main className="min-h-[calc(100dvh-4rem)] bg-background text-foreground">
    <DashboardOverview user={session.user} />
  </main>;
}
`;
}

export function singleDashboardFeatureFilesTanstack(
  hasBilling = true,
  hasAdminNavigation = true,
): TemplateFile[] {
  return singleDashboardFeatureFiles("tanstack", hasBilling, hasAdminNavigation);
}
