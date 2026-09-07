import type { TemplateFile } from "../../../shared.js";
import { singleDashboardFeatureFiles } from "./dashboard-feature.js";

export function singleDashboardFeatureFilesNext(
  hasBilling = true,
  hasAdminNavigation = true,
): TemplateFile[] {
  return singleDashboardFeatureFiles("next", hasBilling, hasAdminNavigation);
}

export function dashboardPageSingle(isConvex = false): string {
  return `import type * as React from "react";
import { Suspense } from "react";
${isConvex ? "" : 'import { headers } from "next/headers";'}
import { redirect } from "next/navigation";
import { getRequestUser } from "@/server/auth";
import { DashboardOverview } from "@/features/dashboard/dashboard-overview";
import { Skeleton } from "@/components/ui/skeleton";

async function DashboardContent(): Promise<React.JSX.Element> {
  const user = await getRequestUser(${isConvex ? "" : "await headers()"});
  if (!user) redirect("/sign-in");
  return <DashboardOverview user={{ name: user.name, email: user.email, role: user.role }} />;
}

function DashboardFallback(): React.JSX.Element {
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>;
}

export default function DashboardPage(): React.JSX.Element {
  return <main className="min-h-[calc(100dvh-4rem)] bg-background text-foreground">
    <Suspense fallback={<DashboardFallback />}><DashboardContent /></Suspense>
  </main>;
}
`;
}
