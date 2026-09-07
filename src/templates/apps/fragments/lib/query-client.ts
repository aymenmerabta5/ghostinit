import { file, type TemplateFile } from "../../../shared.js";

export function queryClientContent(): string {
  return `import { QueryClient } from "@tanstack/react-query";

export interface ResolvedRpcError {
  applicationCode: string;
  transportCode: string;
  status: number;
  message: string;
  meta?: Record<string, unknown>;
}

export interface QueryAuthScope {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  teamId: string | null;
}

const QUERY_AUTH_SCOPE_KEY = ["__ghostinit", "auth-scope"] as const;
const queryAuthScopes = new WeakMap<QueryClient, QueryAuthScope | null>();

interface RpcErrorShape {
  code: string;
  status: number;
  message: string;
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalScopeId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function queryAuthScopeFromSession(value: unknown): QueryAuthScope | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.session)) return null;
  const userId = optionalScopeId(value.user.id);
  const sessionId = optionalScopeId(value.session.id);
  if (!userId || !sessionId) return null;
  return {
    userId,
    sessionId,
    tenantId:
      optionalScopeId(value.session.activeOrganizationId) ??
      optionalScopeId(value.user.activeOrganizationId),
    teamId:
      optionalScopeId(value.session.activeTeamId) ?? optionalScopeId(value.user.activeTeamId),
  };
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
    queryAuthScopes.set(queryClient, hydrated);
    return hydrated;
  }
  return queryAuthScopes.get(queryClient) ?? null;
}

export function authScopedQueryKey(
  scope: QueryAuthScope,
  queryKey: readonly unknown[],
): readonly unknown[] {
  return ["auth", queryAuthScopeSignature(scope), ...queryKey] as const;
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
  }
  const stableScope = nextScope ? { ...nextScope } : null;
  queryAuthScopes.set(queryClient, stableScope);
  queryClient.setQueryData(QUERY_AUTH_SCOPE_KEY, stableScope);
}

function readRpcError(value: unknown): RpcErrorShape | undefined {
  if (!isRecord(value)) return undefined;
  const code = value.code;
  const status = value.status;
  const message = value.message;
  if (typeof code !== "string" || typeof status !== "number" || typeof message !== "string") {
    return undefined;
  }
  return { code, status, message, data: value.data };
}

function findRpcError(error: unknown): RpcErrorShape | undefined {
  let current = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const rpcError = readRpcError(current);
    if (rpcError) return rpcError;
    if (current instanceof Error && current.cause !== undefined) {
      current = current.cause;
      continue;
    }
    return undefined;
  }
  return undefined;
}

export function resolveRpcError(error: unknown): ResolvedRpcError | undefined {
  const rpcError = findRpcError(error);
  if (!rpcError) return undefined;
  const data = isRecord(rpcError.data) ? rpcError.data : undefined;
  const applicationCode = typeof data?.code === "string" ? data.code : rpcError.code;
  const meta = isRecord(data?.meta) ? data.meta : undefined;
  return {
    applicationCode,
    transportCode: rpcError.code,
    status: rpcError.status,
    message: rpcError.message,
    ...(meta ? { meta } : {}),
  };
}

export function hasRpcErrorCode(error: unknown, ...codes: readonly string[]): boolean {
  const rpcError = resolveRpcError(error);
  return (
    rpcError !== undefined &&
    (codes.includes(rpcError.applicationCode) || codes.includes(rpcError.transportCode))
  );
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const rpcError = resolveRpcError(error);
  if (!rpcError) return true;
  return rpcError.status === 408 || rpcError.status === 429 || rpcError.status >= 500;
}

export function makeQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 30_000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
  queryAuthScopes.set(queryClient, null);
  return queryClient;
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
`;
}

export function queryClientLibFiles(base = "apps/web/src"): TemplateFile[] {
  return [file(`${base}/lib/query-client.ts`, queryClientContent())];
}
