import type { TemplateFile } from "../../shared.js";
import { tanstackDashboardFeatureFiles } from "./dashboard-tanstack.js";

function nextLinkContent(content: string): string {
  return content
    .replace('import { Link } from "@tanstack/react-router";', 'import Link from "next/link";')
    .replaceAll("<Link to=", "<Link href=");
}

/** Dashboard presentation is identical across routers; only Link composition differs. */
export function nextDashboardFeatureFiles(
  hasBilling = true,
  hasAdminNavigation = true,
): TemplateFile[] {
  return tanstackDashboardFeatureFiles(hasBilling, hasAdminNavigation).map((entry) => ({
    ...entry,
    content: nextLinkContent(entry.content),
  }));
}

export function nextDashboardPageContent(isConvex = false): string {
  return `import type * as React from "react";
import { cache, Suspense } from "react";
${isConvex ? "" : 'import { headers } from "next/headers";'}
import { redirect } from "next/navigation";
import { getRequestUser } from "@repo/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardView } from "@/features/dashboard/dashboard-view";

const getCachedSession = cache(async () => {
  const user = await getRequestUser(${isConvex ? "" : "await headers()"});
  return user ? { user } : null;
});

async function DashboardContent(): Promise<React.JSX.Element> {
  const session = await getCachedSession();
  if (!session?.user) redirect("/sign-in");
  return <DashboardView user={{
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  }} />;
}

function DashboardSkeleton(): React.JSX.Element {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64 w-full" />
  </div>;
}

export default function DashboardPage(): React.JSX.Element {
  return <main className="min-h-screen bg-background text-foreground">
    <Suspense fallback={<DashboardSkeleton />}><DashboardContent /></Suspense>
  </main>;
}
`;
}
