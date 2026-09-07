/** Current-user selection shared by dashboard identity and privileged controls. */
export function dashboardIdentityQueriesContent(): string {
  return `"use client";
import { useSyncExternalStore } from "react";
import { identityClient } from "@/lib/auth-client";
import { useQueryAuthSession } from "@/components/query-auth-boundary";

export interface DashboardIdentityUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useDashboardIdentity(initialUser?: DashboardIdentityUser) {
  const session = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const pending = canonical?.hasCanonicalApi ? canonical.isPending : session.isPending;
  const error = canonical?.hasCanonicalApi ? canonical.error : session.error;
  const liveUser = canonical?.hasCanonicalApi ? canonical.currentRequest?.user : session.data?.user;
  const user: DashboardIdentityUser | null | undefined = hydrated
    ? pending || error ? null : liveUser
    : initialUser ?? liveUser;
  return { user, pending: hydrated && pending, error: hydrated ? error : null };
}
`;
}

export function dashboardIdentityStateContent(): string {
  return `"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardIdentityStatus({ pending, error, className }: {
  pending: boolean; error: unknown; className?: string;
}): React.JSX.Element {
  const common = useSurfaceTranslations("common");
  const errors = useSurfaceTranslations("errors");
  if (pending) return <Card className={className} role="status" aria-busy={true} aria-label={common("loading")}>
    <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
    <CardContent className="space-y-7"><div className="flex items-center gap-4"><Skeleton className="size-16 shrink-0 rounded-2xl" /><div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-4 w-full" /></div></div><Skeleton className="h-4 w-full" /><Skeleton className="h-9 w-28" /></CardContent>
  </Card>;
  return <Alert className={className} role="alert" variant={error ? "destructive" : "default"}>
    <AlertTitle>{errors(error ? "genericTitle" : "unauthorizedTitle")}</AlertTitle>
    <AlertDescription>{errors(error ? "genericDescription" : "unauthorizedDescription")}</AlertDescription>
  </Alert>;
}
`;
}
