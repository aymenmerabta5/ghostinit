import { file, type TemplateFile } from "../../../shared.js";

export function settingsSessionsDataContent(useServerActions = false): string {
  const actionImport = useServerActions
    ? 'import { revokeIdentitySessionAction, revokeOtherIdentitySessionsAction } from "./actions";'
    : "";
  const revokeSessionOptions = useServerActions
    ? `return { mutationFn: async (input: { sessionId: string }) => {
    const result = await revokeIdentitySessionAction(input);
    if (!result.ok) throw new Error(result.error);
    return result;
  }, onSuccess: async () => invalidateIdentitySessions(queryClient) };`
    : `return orpc.identity.sessions.revoke.mutationOptions({
    onSuccess: async () => invalidateIdentitySessions(queryClient),
  });`;
  const revokeOthersOptions = useServerActions
    ? `return { mutationFn: async (_input: Record<string, never>) => {
    const result = await revokeOtherIdentitySessionsAction();
    if (!result.ok) throw new Error(result.error);
    return result;
  }, onSuccess: async () => invalidateIdentitySessions(queryClient) };`
    : `return orpc.identity.sessions.revokeOthers.mutationOptions({
    onSuccess: async () => invalidateIdentitySessions(queryClient),
  });`;
  return `"use client";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { identityClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, queryInitialDataForScope, type QueryAuthScope } from "@/lib/query-client";
${actionImport}

export interface IdentitySessionInitialData {
  id: string; userId: string; createdAt: string; authenticatedAt: string; expiresAt: string;
  revokedAt: string | null; activeOrganizationId?: string | null; activeTeamId?: string | null;
  ipAddress?: string | null; userAgent?: string | null;
}

export interface IdentitySessionsInitialState {
  initialSessions?: IdentitySessionInitialData[];
  initialScope?: QueryAuthScope;
}

export function identitySessionsQueryOptions(scope: QueryAuthScope | null, initialData?: IdentitySessionInitialData[], initialScope?: QueryAuthScope) {
  const options = orpc.identity.sessions.list.queryOptions({
    input: {}, initialData: queryInitialDataForScope(scope, initialScope, initialData),
  });
  return {
    ...options,
    queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "identity-sessions"],
    enabled: Boolean(scope) && typeof window !== "undefined",
  };
}

export function identitySessionsQueryKey(scope: QueryAuthScope) {
  return authScopedQueryKey(scope, orpc.identity.sessions.list.key({ type: "query" }));
}

async function invalidateIdentitySessions(queryClient: QueryClient): Promise<void> {
  const scope = currentQueryAuthScope(queryClient);
  if (scope) await queryClient.invalidateQueries({ queryKey: identitySessionsQueryKey(scope) });
}

export function revokeIdentitySessionMutationOptions(queryClient: QueryClient) {
  ${revokeSessionOptions}
}

export function revokeOtherIdentitySessionsMutationOptions(queryClient: QueryClient) {
  ${revokeOthersOptions}
}

export function useIdentitySessions({ initialSessions, initialScope }: IdentitySessionsInitialState) {
  const queryClient = useQueryClient();
  const { data: currentSession, isPending: sessionPending } = identityClient.useSession();
  const scope = currentQueryAuthScope(queryClient) ?? (sessionPending ? initialScope ?? null : null);
  const sessionsQuery = useQuery(identitySessionsQueryOptions(scope, initialSessions, initialScope));
  const revokeSession = useMutation(revokeIdentitySessionMutationOptions(queryClient));
  const revokeOthers = useMutation(revokeOtherIdentitySessionsMutationOptions(queryClient));
  return {
    currentSessionId: currentSession?.session.id,
    sessions: (sessionsQuery.data ?? []).filter((session) => session.revokedAt === null),
    error: sessionsQuery.error ?? revokeSession.error ?? revokeOthers.error,
    isLoading: sessionsQuery.isPending,
    isRefreshing: sessionsQuery.isFetching,
    pendingSessionId: revokeSession.isPending ? revokeSession.variables?.sessionId : undefined,
    isRevokingOthers: revokeOthers.isPending,
    refresh: () => { void sessionsQuery.refetch(); },
    revokeSession: (sessionId: string) => revokeSession.mutate({ sessionId }),
    revokeOtherSessions: () => revokeOthers.mutate({}),
  };
}
`;
}

export function settingsSessionsData(useServerActions = false): TemplateFile {
  return file(
    "apps/web/src/app/settings/sessions.ts",
    settingsSessionsDataContent(useServerActions),
  );
}
