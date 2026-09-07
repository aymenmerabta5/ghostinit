import { file, type TemplateFile } from "../../../shared.js";

export function settingsSessionsListContent(): string {
  return `"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";

export interface IdentitySessionItem {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: string | number | Date;
}

interface SessionListProps {
  currentSessionId?: string;
  isLoading: boolean;
  pendingSessionId?: string;
  sessions: IdentitySessionItem[];
  onRevoke: (sessionId: string) => void;
}

export function SessionList({
  currentSessionId,
  isLoading,
  pendingSessionId,
  sessions,
  onRevoke,
}: SessionListProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const locale = useSurfaceLocale();
  const dateFormatter = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );
  if (isLoading) return <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("sessions.loading")}>
    {Array.from({ length: 3 }).map((_, index) => <div key={index} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3.5 w-16" /></div>)}
  </div>;
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">{t("sessions.empty")}</p>;
  return <div className="flex flex-col gap-2">{sessions.map((session) => {
    const isCurrent = session.id === currentSessionId;
    const isRevoking = pendingSessionId === session.id;
    return <div key={session.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-mono text-xs">{session.id.slice(0, 8)}…{session.userAgent ?? t("sessions.unknownDevice")}</span>
        <span className="text-xs text-muted-foreground">{session.ipAddress ?? t("sessions.unknownIp")} • {t("sessions.expiresAt", { date: dateFormatter.format(new Date(session.expiresAt)) })}</span>
      </div>
      <div className="flex items-center gap-2">
        {isCurrent ? <Badge variant="secondary">{t("sessions.current")}</Badge> : null}
        <Button size="sm" variant="outline" disabled={isCurrent || isRevoking} onClick={() => onRevoke(session.id)}>{isRevoking ? t("sessions.revoking") : t("sessions.revoke")}</Button>
      </div>
    </div>;
  })}</div>;
}
`;
}

export function settingsSessionsCardContent(useServerActions = false): string {
  const actionImport = useServerActions
    ? 'import { revokeIdentitySessionAction, revokeOtherIdentitySessionsAction } from "../actions";'
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
import type * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { identityClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, queryInitialDataForScope, type QueryAuthScope } from "@/lib/query-client";
import { useSurfaceTranslations } from "@/lib/translations";
import { SessionList } from "./session-list";
${actionImport}

export interface IdentitySessionInitialData {
  id: string; userId: string; createdAt: string; authenticatedAt: string; expiresAt: string;
  revokedAt: string | null; activeOrganizationId?: string | null; activeTeamId?: string | null;
  ipAddress?: string | null; userAgent?: string | null;
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

export function SessionsCard({ initialSessions, initialScope }: { initialSessions?: IdentitySessionInitialData[]; initialScope?: QueryAuthScope }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const queryClient = useQueryClient();
  const { data: currentSession, isPending: sessionPending } = identityClient.useSession();
  const scope = currentQueryAuthScope(queryClient) ?? (sessionPending ? initialScope ?? null : null);
  const sessionsQuery = useQuery(identitySessionsQueryOptions(scope, initialSessions, initialScope));
  const revokeSession = useMutation(revokeIdentitySessionMutationOptions(queryClient));
  const revokeOthers = useMutation(revokeOtherIdentitySessionsMutationOptions(queryClient));
  const sessions = (sessionsQuery.data ?? []).filter((session) => session.revokedAt === null);
  const operationError = sessionsQuery.error ?? revokeSession.error ?? revokeOthers.error;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2"><CardTitle className="text-base">{t("sessions.title")}</CardTitle><Badge variant="secondary">{sessions.length}</Badge></div>
        <CardDescription className="max-w-[60ch]">{t("sessions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {operationError ? <Alert variant="destructive"><AlertTitle>{t("sessions.errorTitle")}</AlertTitle><AlertDescription>{operationError instanceof Error ? operationError.message : t("sessions.genericError")}</AlertDescription></Alert> : null}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}>{sessionsQuery.isFetching ? t("sessions.loading") : t("sessions.refresh")}</Button>
          <Button size="sm" variant="destructive" onClick={() => revokeOthers.mutate({})} disabled={sessions.length <= 1 || revokeOthers.isPending}>{revokeOthers.isPending ? t("sessions.revokingOthers") : t("sessions.revokeOthers")}</Button>
        </div>
        <Separator />
        <SessionList
          currentSessionId={currentSession?.session.id}
          isLoading={sessionsQuery.isPending}
          pendingSessionId={revokeSession.isPending ? revokeSession.variables?.sessionId : undefined}
          sessions={sessions}
          onRevoke={(sessionId) => revokeSession.mutate({ sessionId })}
        />
      </CardContent>
    </Card>
  );
}
`;
}

export function settingsSessionsCard(useServerActions = false): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/sessions-card.tsx",
    settingsSessionsCardContent(useServerActions),
  );
}

export function settingsSessionsList(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/session-list.tsx",
    settingsSessionsListContent(),
  );
}
