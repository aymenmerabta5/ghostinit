import { file, type TemplateFile } from "../../shared.js";

export function requestOwnedSnapshotContent(): string {
  return `"use client";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { currentQueryAuthGeneration, queryAuthScopeSignature, type QueryAuthScope } from "@/lib/query-client";
import { QueryAuthStatus, useQueryAuthSession } from "@/components/query-auth-boundary";

const refreshed = new WeakMap<object, number>();
const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function RequestOwnedSnapshot({ scope, children }: { scope: QueryAuthScope; children: React.ReactNode }): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useQueryAuthSession();
  const hydrated = React.useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const [refreshError, setRefreshError] = React.useState(false);
  const generation = currentQueryAuthGeneration(queryClient);
  const owner = queryAuthScopeSignature(scope);
  const matches = auth?.scope !== null && auth?.scope !== undefined && queryAuthScopeSignature(auth.scope) === owner;
  const retry = React.useCallback(() => {
    setRefreshError(false);
    refreshed.set(queryClient, currentQueryAuthGeneration(queryClient));
    try { router.refresh(); } catch { setRefreshError(true); }
  }, [queryClient, router]);
  React.useEffect(() => {
    if (!hydrated || !auth || auth.isPending || auth.error || matches || refreshed.get(queryClient) === generation) return;
    retry();
  }, [hydrated, auth, matches, generation, queryClient, retry]);
  if (hydrated && (!auth || auth.isPending || auth.error || !matches)) {
    return <QueryAuthStatus error={Boolean(auth?.error || refreshError || !auth)} retry={auth?.error ? auth.retry : retry} />;
  }
  return <React.Fragment key={owner + ":" + generation}>{children}</React.Fragment>;
}
`;
}

export function requestOwnedSnapshotFile(base = "apps/web/src"): TemplateFile {
  return file(`${base}/components/request-owned-snapshot.tsx`, requestOwnedSnapshotContent());
}
