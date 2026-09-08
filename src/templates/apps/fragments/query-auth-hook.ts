export function canonicalQueryAuthHookContent(queryImport = "@/lib/query-client"): string {
  return `"use client";
import * as React from "react";
import { notifyManager, type QueryClient } from "@tanstack/react-query";
import {
  currentQueryAuthGeneration, currentQueryAuthScope, invalidateQueryAuthScope, observeQueryAuthIdentity,
  queryAuthIdentityFromSession, queryAuthIdentitySignature, queryAuthScopeFromCurrentRequest, queryAuthScopeSignature,
  requestQueryAuthScopeRefresh, subscribeQueryAuthGeneration, subscribeQueryAuthScopeRefresh, transitionQueryAuthScope,
  type QueryAuthScope,
} from "${queryImport}";

export interface CanonicalQueryAuthState<T> {
  scope: QueryAuthScope | null;
  currentRequest: T | null;
  isPending: boolean;
  error: Error | null;
  retry(): void;
}

export function useCanonicalQueryAuthScope<T>(
  queryClient: QueryClient,
  sessionData: unknown,
  sessionPending: boolean,
  readCurrentRequest: () => Promise<T>,
): CanonicalQueryAuthState<T> {
  const identity = React.useMemo(() => queryAuthIdentityFromSession(sessionData), [sessionData]);
  const signature = queryAuthIdentitySignature(identity);
  const subscribe = React.useCallback((changed: () => void) => {
    let active = true;
    const notify = notifyManager.batchCalls(() => { if (active) changed(); });
    const unsubscribe = subscribeQueryAuthGeneration(queryClient, notify);
    // Explicit workspace changes must hide the old subtree in the same commit.
    const unsubscribeRefresh = subscribeQueryAuthScopeRefresh(queryClient, changed);
    return () => { active = false; unsubscribe(); unsubscribeRefresh(); };
  }, [queryClient]);
  const readGeneration = React.useCallback(() => currentQueryAuthGeneration(queryClient), [queryClient]);
  const generation = React.useSyncExternalStore(subscribe, readGeneration, () => 0);
  type Resolution = { client: QueryClient; signature: string; generation: number; scope: QueryAuthScope | null; currentRequest: T | null; error: Error | null };
  const [resolution, setResolution] = React.useState<Resolution | null>(null);
  const accepted = React.useRef<Resolution | null>(null);
  const observed = React.useRef<{ client: QueryClient; pending: boolean } | null>(null);

  React.useLayoutEffect(() => {
    if (sessionPending) {
      if (observed.current?.client !== queryClient || !observed.current.pending) invalidateQueryAuthScope(queryClient);
    } else observeQueryAuthIdentity(queryClient, identity);
    observed.current = { client: queryClient, pending: sessionPending };
  }, [queryClient, identity, signature, sessionPending]);

  React.useEffect(() => {
    if (sessionPending) return;
    const epoch = currentQueryAuthGeneration(queryClient);
    // Identity observation can invalidate this render before its passive effect runs.
    if (generation !== epoch) return;
    if (accepted.current?.client === queryClient && accepted.current.generation === epoch && accepted.current.signature === signature) return;
    let cancelled = false;
    const current = () => !cancelled && currentQueryAuthGeneration(queryClient) === epoch;
    const commit = (scope: QueryAuthScope | null, currentRequest: T | null, error: Error | null) => {
      if (!current()) return;
      const expectedEpoch = epoch + (queryAuthScopeSignature(currentQueryAuthScope(queryClient)) === queryAuthScopeSignature(scope) ? 0 : 1);
      transitionQueryAuthScope(queryClient, scope);
      if (cancelled || currentQueryAuthGeneration(queryClient) !== expectedEpoch) return;
      const next = { client: queryClient, signature, generation: expectedEpoch, scope, currentRequest, error };
      accepted.current = next;
      setResolution(next);
    };
    if (!identity) commit(null, null, null);
    else void Promise.resolve().then(async () => {
      if (!current()) return;
      const value = await readCurrentRequest();
      if (!current()) return;
      const scope = queryAuthScopeFromCurrentRequest(identity, value);
      commit(scope, scope ? value : null, null);
    }).catch((error: unknown) => {
      if (current()) commit(null, null, error instanceof Error ? error : new Error("Session verification failed"));
    });
    return () => { cancelled = true; };
  }, [queryClient, identity, signature, sessionPending, generation, readCurrentRequest]);

  const retry = React.useCallback(() => requestQueryAuthScopeRefresh(queryClient), [queryClient]);
  const settled = !sessionPending && resolution?.client === queryClient && resolution.signature === signature && resolution.generation === generation;
  return {
    scope: settled ? resolution.scope : null,
    currentRequest: settled ? resolution.currentRequest : null,
    isPending: !settled,
    error: settled ? resolution.error : null,
    retry,
  };
}
`;
}
