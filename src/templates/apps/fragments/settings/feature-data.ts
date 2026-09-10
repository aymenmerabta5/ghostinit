import { passkeyQueryHelpersContent, passkeyQueryImports } from "./passkey-data.js";

export function settingsFeatureModelContent(): string {
  return `import type { QueryAuthScope } from "@/lib/query-client";
export interface SettingsUser { id: string; email: string; name: string | null; role?: string | null; }
export interface IdentitySessionInitialData {
  id: string; userId: string; createdAt: string; authenticatedAt: string; expiresAt: string;
  revokedAt: string | null; activeOrganizationId?: string | null; activeTeamId?: string | null;
  ipAddress?: string | null; userAgent?: string | null;
}
export interface IdentitySessionsInitialState { initialSessions?: IdentitySessionInitialData[]; initialScope?: QueryAuthScope; }
export interface PasskeySummary { readonly id: string; readonly name?: string; readonly createdAt: Date | string; readonly deviceType: string; readonly backedUp: boolean; }
export type TwoFactorInput = ({ kind: "enable" | "disable"; password: string } | { kind: "verify"; code: string }) & { previousEnabled?: boolean };
export type PasskeyInput = { kind: "register"; name?: string } | { kind: "rename"; id: string; name: string } | { kind: "delete"; id: string };
export function identityFailure(error: unknown): Error {
  return new Error("Identity operation failed", { cause: error });
}
export function identityErrorCode(error: unknown): string | undefined {
  const value = error instanceof Error ? error.cause : error;
  return value && typeof value === "object" && "code" in value && typeof value.code === "string" ? value.code : undefined;
}
`;
}

export function settingsFeatureQueriesContent(hasSessions: boolean, hasPasskey: boolean): string {
  return `"use client";
import { identityClient${hasPasskey ? ", identityPasskeyClient" : ""} } from "@/lib/auth-client";
${hasPasskey ? passkeyQueryImports : 'import { useQueryAuthSession } from "@/components/query-auth-boundary";'}
${hasSessions || hasPasskey ? 'import { useQuery, useQueryClient } from "@tanstack/react-query";' : ""}
${hasSessions || hasPasskey ? `import { authScopedQueryKey, ${hasSessions ? "currentQueryAuthScope, queryInitialDataForScope, type QueryAuthScope," : ""} ${hasPasskey ? "currentQueryAuthGeneration, queryAuthIdentityFromSession, queryAuthIdentitySignature, type QueryAuthIdentity," : ""} } from "@/lib/query-client";` : ""}
${hasSessions ? 'import { orpc } from "@/lib/orpc";\nimport type { IdentitySessionInitialData, IdentitySessionsInitialState } from "./model";' : ""}

export function useSettingsIdentityQuery() {
  const sessionState = identityClient.useSession();
  const canonical = useQueryAuthSession();
  const user = canonical?.hasCanonicalApi ? canonical.currentRequest?.user : sessionState.data?.user;
  return {
    user,
    isPending: canonical?.hasCanonicalApi ? canonical.isPending : sessionState.isPending,
    error: canonical?.hasCanonicalApi ? canonical.error : sessionState.error,
    sessionId: sessionState.data?.session.id,
    twoFactorEnabled: sessionState.data?.user ? Reflect.get(sessionState.data.user, "twoFactorEnabled") === true : false,
  };
}
${hasPasskey ? passkeyQueryHelpersContent() : ""}
${
  hasSessions
    ? `
export function identitySessionsQueryKey(scope: QueryAuthScope) {
  return authScopedQueryKey(scope, orpc.identity.sessions.list.key({ type: "query" }));
}
export function identitySessionsQueryOptions(scope: QueryAuthScope | null, initialData?: IdentitySessionInitialData[], initialScope?: QueryAuthScope) {
  const options = orpc.identity.sessions.list.queryOptions({ input: {}, initialData: queryInitialDataForScope(scope, initialScope, initialData) });
  return { ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "identity-sessions"], enabled: Boolean(scope) && typeof window !== "undefined" };
}
export function useSettingsSessionsQuery({ initialSessions, initialScope }: IdentitySessionsInitialState) {
  const queryClient = useQueryClient();
  const session = identityClient.useSession();
  const scope = currentQueryAuthScope(queryClient) ?? (session.isPending ? initialScope ?? null : null);
  return useQuery(identitySessionsQueryOptions(scope, initialSessions, initialScope));
}
`
    : ""
}
`;
}

export function settingsFeatureMutationsContent(
  router: "next" | "tanstack",
  hasSessions: boolean,
  hasEmail: boolean,
  hasPasskey: boolean,
): string {
  return `"use client";
import { identityClient${hasPasskey ? ", identityPasskeyClient" : ""} } from "@/lib/auth-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { requestQueryAuthScopeRefresh${hasSessions || hasPasskey ? ", currentQueryAuthScope" : ""}${hasPasskey ? ", authScopedQueryKey" : ""} } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";
${hasSessions ? 'import { identitySessionsQueryKey } from "./queries";' : ""}
${hasSessions && router === "next" ? 'import { revokeIdentitySessionAction, revokeOtherIdentitySessionsAction } from "@/app/settings/actions";' : ""}
${hasSessions && router === "tanstack" ? 'import { orpc } from "@/lib/orpc";' : ""}
import { identityFailure${hasEmail ? ", type TwoFactorInput" : ""}${hasPasskey ? ", type PasskeyInput" : ""} } from "./model";

export function useSettingsIdentityRefresh(): () => void {
  const queryClient = useQueryClient();
  return () => requestQueryAuthScopeRefresh(queryClient);
}
export function useUpdateProfileMutation() {
  return useAuthOwnedMutation(async (input: { name: string }) => {
    const result = await identityClient.updateProfile(input);
    if (result.error) throw identityFailure(result.error);
  });
}
${
  hasEmail
    ? `
export function useChangePasswordMutation() {
  return useAuthOwnedMutation(async (input: { currentPassword: string; newPassword: string }) => {
    const result = await identityClient.changePassword({ ...input, revokeOtherSessions: true });
    if (result.error) throw identityFailure(result.error);
  });
}
export function useTwoFactorMutation() {
  return useAuthOwnedMutation(async (input: TwoFactorInput) => {
    if (input.kind === "enable") {
      const result = await identityClient.enableTwoFactor({ password: input.password });
      if (result.error || !result.data) throw identityFailure(result.error);
      return { kind: "challenge" as const, totpUri: result.data.totpURI, backupCodes: result.data.backupCodes };
    }
    const result = input.kind === "verify"
      ? await identityClient.verifyTwoFactor({ code: input.code, trustDevice: false })
      : await identityClient.disableTwoFactor({ password: input.password });
    if (result.error) throw identityFailure(result.error);
    return { kind: "complete" as const, enabled: input.kind === "verify" };
  });
}
`
    : ""
}
${
  hasPasskey
    ? `
export function usePasskeyMutation() {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(async (input: PasskeyInput) => {
    const result = input.kind === "register" ? await identityPasskeyClient.register({ name: input.name })
      : input.kind === "rename" ? await identityPasskeyClient.rename({ id: input.id, name: input.name })
      : await identityPasskeyClient.delete({ id: input.id });
    if (result.error) throw identityFailure(result.error);
    return input.kind;
  }, { onSuccess: async () => {
    const scope = currentQueryAuthScope(queryClient);
    if (scope) await queryClient.invalidateQueries({ queryKey: authScopedQueryKey({ ...scope, tenantId: null, teamId: null }, ["identity", "passkeys"]) });
  } });
}
`
    : ""
}
${
  hasSessions
    ? `
export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(async (input: { sessionId: string } | { others: true }) => {
${
  router === "next"
    ? `    const result = "others" in input ? await revokeOtherIdentitySessionsAction() : await revokeIdentitySessionAction(input);
    if (!result.ok) throw new Error(result.error);`
    : `    if ("others" in input) await orpc.identity.sessions.revokeOthers.call({});
    else await orpc.identity.sessions.revoke.call(input);`
}
  }, { onSuccess: async () => {
    const scope = currentQueryAuthScope(queryClient);
    if (scope) await queryClient.invalidateQueries({ queryKey: identitySessionsQueryKey(scope) });
  } });
}
`
    : ""
}
`;
}
