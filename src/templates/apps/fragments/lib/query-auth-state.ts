export function queryAuthStateContent(): string {
  return `export interface QueryAuthIdentity {
  userId: string;
  sessionId: string;
}

export interface QueryAuthScope extends QueryAuthIdentity {
  tenantId: string | null;
  teamId: string | null;
}

const QUERY_AUTH_SCOPE_KEY = ["__ghostinit", "auth-scope"] as const;
const queryAuthScopes = new WeakMap<QueryClient, QueryAuthScope | null>();
const queryAuthGenerations = new WeakMap<QueryClient, number>();
const queryAuthIdentities = new WeakMap<QueryClient, QueryAuthIdentity | null>();
const queryAuthRefreshListeners = new WeakMap<QueryClient, Set<() => void>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalScopeId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function queryAuthIdentityFromSession(value: unknown): QueryAuthIdentity | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) return null;
  const userId = optionalScopeId(value.user.id);
  const sessionId = optionalScopeId(value.session.id);
  if (!userId || !sessionId) return null;
  return { userId, sessionId };
}

export function queryAuthIdentitySignature(identity: QueryAuthIdentity | null): string {
  return identity ? JSON.stringify([identity.userId, identity.sessionId]) : "anonymous";
}

export function currentQueryAuthIdentity(queryClient: QueryClient): QueryAuthIdentity | null {
  return queryAuthIdentities.has(queryClient)
    ? queryAuthIdentities.get(queryClient) ?? null
    : currentQueryAuthScope(queryClient);
}

export function queryAuthScopeFromCurrentRequest(
  identity: QueryAuthIdentity | null,
  value: unknown,
): QueryAuthScope | null {
  if (!identity) return null;
  if (!isRecord(value)) throw new Error("Invalid authenticated application context");
  if (value.user === null) return null;
  if (!isRecord(value.user) || !optionalScopeId(value.user.id) || value.sessionId !== identity.sessionId) {
    throw new Error("Authenticated application context does not match the current session");
  }
  if (value.user.banned === true) return null;
  const tenantId = value.activeOrganizationId;
  const teamId = value.activeTeamId;
  if ((tenantId !== null && !optionalScopeId(tenantId)) || (teamId !== null && !optionalScopeId(teamId))) {
    throw new Error("Invalid authenticated application scope");
  }
  return { ...identity, tenantId: tenantId as string | null, teamId: teamId as string | null };
}

export function queryAuthScopeSignature(scope: QueryAuthScope | null): string {
  if (!scope) return "anonymous";
  return JSON.stringify([
    scope.userId,
    scope.sessionId,
    scope.tenantId ?? "",
    scope.teamId ?? "",
  ]);
}

export function currentQueryAuthScope(queryClient: QueryClient): QueryAuthScope | null {
  const hydrated = queryClient.getQueryData<QueryAuthScope | null>(QUERY_AUTH_SCOPE_KEY);
  if (hydrated !== undefined) {
    const previous = queryAuthScopes.get(queryClient) ?? null;
    if (queryAuthScopeSignature(previous) !== queryAuthScopeSignature(hydrated)) {
      queryAuthGenerations.set(queryClient, (queryAuthGenerations.get(queryClient) ?? 0) + 1);
    }
    queryAuthScopes.set(queryClient, hydrated);
    return hydrated;
  }
  return queryAuthScopes.get(queryClient) ?? null;
}

export function currentQueryAuthGeneration(queryClient: QueryClient): number {
  currentQueryAuthScope(queryClient);
  return queryAuthGenerations.get(queryClient) ?? 0;
}

export function invalidateQueryAuthScope(queryClient: QueryClient): void {
  const generation = currentQueryAuthGeneration(queryClient);
  queryAuthGenerations.set(queryClient, generation + 1);
  queryAuthScopes.set(queryClient, null);
  queryClient.clear();
  queryClient.setQueryData(QUERY_AUTH_SCOPE_KEY, null);
}

export function observeQueryAuthIdentity(queryClient: QueryClient, identity: QueryAuthIdentity | null): void {
  const scope = currentQueryAuthScope(queryClient);
  const previous = queryAuthIdentities.has(queryClient) ? queryAuthIdentities.get(queryClient)! : scope;
  queryAuthIdentities.set(queryClient, identity ? { ...identity } : null);
  if (queryAuthIdentitySignature(previous) !== queryAuthIdentitySignature(identity) ||
      (scope && queryAuthIdentitySignature(scope) !== queryAuthIdentitySignature(identity))) {
    invalidateQueryAuthScope(queryClient);
  }
}

export function subscribeQueryAuthScopeRefresh(queryClient: QueryClient, listener: () => void): () => void {
  let listeners = queryAuthRefreshListeners.get(queryClient);
  if (!listeners) {
    listeners = new Set();
    queryAuthRefreshListeners.set(queryClient, listeners);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function requestQueryAuthScopeRefresh(queryClient: QueryClient): void {
  invalidateQueryAuthScope(queryClient);
  for (const listener of queryAuthRefreshListeners.get(queryClient) ?? []) listener();
}

export function subscribeQueryAuthGeneration(queryClient: QueryClient, listener: () => void): () => void {
  let observedGeneration = currentQueryAuthGeneration(queryClient);
  const changed = () => {
    const generation = currentQueryAuthGeneration(queryClient);
    if (generation === observedGeneration) return;
    observedGeneration = generation;
    listener();
  };
  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    const key = event.query.queryKey;
    if (key.length === QUERY_AUTH_SCOPE_KEY.length && key.every((value: unknown, index: number) => value === QUERY_AUTH_SCOPE_KEY[index])) changed();
  });
  const unsubscribeRefresh = subscribeQueryAuthScopeRefresh(queryClient, changed);
  return () => { unsubscribeCache(); unsubscribeRefresh(); };
}

export function authScopedQueryKey(
  scope: QueryAuthScope,
  queryKey: readonly unknown[],
): readonly unknown[] {
  return ["auth", queryAuthScopeSignature(scope), ...queryKey] as const;
}

export function queryInitialDataForScope<T>(
  scope: QueryAuthScope | null,
  initialScope: QueryAuthScope | undefined,
  initialData: T | undefined,
): T | undefined {
  return scope && initialScope && queryAuthScopeSignature(scope) === queryAuthScopeSignature(initialScope)
    ? initialData
    : undefined;
}

export function adminUsersQueryKey(
  scope: QueryAuthScope,
  input?: { search: string; page: number; limit: number },
): readonly unknown[] {
  return authScopedQueryKey(scope, input ? ["admin-users", input] : ["admin-users"]);
}

export function billingSnapshotQueryKey(scope: QueryAuthScope): readonly unknown[] {
  return authScopedQueryKey(scope, ["billing", "snapshot"]);
}

export function identityWorkspaceInitialQueryKey(scope: QueryAuthScope): readonly unknown[] {
  return authScopedQueryKey(scope, ["identity-workspace", "initial"]);
}

export function messagingConversationsQueryKey(scope: QueryAuthScope): readonly unknown[] {
  return authScopedQueryKey(scope, ["messaging", "conversations"]);
}

export function initialUserFeatureFlagQueryKey(scope: QueryAuthScope): readonly unknown[] {
  return authScopedQueryKey(scope, ["feature-flags", "new-dashboard"]);
}

/**
 * Change the authenticated cache owner before descendants can read cached data.
 * Keeping the scope marker in Query itself lets TanStack SSR hydration carry the
 * owner into the browser without a second, process-global store.
 */
export function transitionQueryAuthScope(
  queryClient: QueryClient,
  nextScope: QueryAuthScope | null,
): void {
  const current = currentQueryAuthScope(queryClient);
  if (queryAuthScopeSignature(current) !== queryAuthScopeSignature(nextScope)) {
    queryClient.clear();
    queryAuthGenerations.set(queryClient, (queryAuthGenerations.get(queryClient) ?? 0) + 1);
  }
  const stableScope = nextScope ? { ...nextScope } : null;
  queryAuthScopes.set(queryClient, stableScope);
  queryClient.setQueryData(QUERY_AUTH_SCOPE_KEY, stableScope);
}

export function createQueryAuthSessionResolver<T extends { queryScope: QueryAuthScope | null }>(
  readSession: () => Promise<T>,
  onCommit: (queryClient: QueryClient, session: T) => void,
) {
  type AcceptedSession = { protectedSession: T; queryScope: QueryAuthScope | null };
  type Completion = { result: AcceptedSession; generation: number } | null;
  type Request = { generation: number; promise: Promise<Completion> };
  const requests = new WeakMap<QueryClient, Request>();

  function startRequest(queryClient: QueryClient, generation: number): Request {
    const request: Request = {
      generation,
      promise: Promise.resolve().then(async (): Promise<Completion> => {
        if (currentQueryAuthGeneration(queryClient) !== generation) return null;
        let session: T;
        try {
          session = await readSession();
        } catch (error) {
          if (currentQueryAuthGeneration(queryClient) !== generation) return null;
          throw error;
        }
        if (currentQueryAuthGeneration(queryClient) !== generation) return null;
        // Scope transition and cache seeding are one synchronous commit. No old
        // response can run either operation after a newer owner is installed.
        const acceptedGeneration = generation + (
          queryAuthScopeSignature(currentQueryAuthScope(queryClient)) === queryAuthScopeSignature(session.queryScope) ? 0 : 1
        );
        transitionQueryAuthScope(queryClient, session.queryScope);
        if (currentQueryAuthGeneration(queryClient) !== acceptedGeneration) return null;
        onCommit(queryClient, session);
        return {
          result: { protectedSession: session, queryScope: session.queryScope },
          generation: acceptedGeneration,
        };
      }).finally(() => {
        if (requests.get(queryClient) === request) requests.delete(queryClient);
      }),
    };
    requests.set(queryClient, request);
    return request;
  }

  return async function resolveSession(queryClient: QueryClient): Promise<AcceptedSession> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generation = currentQueryAuthGeneration(queryClient);
      const pending = requests.get(queryClient);
      const request = pending?.generation === generation
        ? pending
        : startRequest(queryClient, generation);
      const completion = await request.promise;
      if (completion && completion.generation === currentQueryAuthGeneration(queryClient)) {
        return completion.result;
      }
    }
    throw new DOMException("Authentication changed while loading. Please retry.", "AbortError");
  };
}

`;
}
