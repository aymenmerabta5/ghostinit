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
  if (isLoading) return <div className="divide-y rounded-lg border" aria-busy="true" aria-label={t("sessions.loading")}>
    {Array.from({ length: 3 }).map((_, index) => <div key={index} className="flex items-center justify-between gap-4 p-4"><Skeleton className="h-4 w-40" /><Skeleton className="h-8 w-20" /></div>)}
  </div>;
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">{t("sessions.empty")}</p>;
  return <div className="divide-y rounded-lg border">{sessions.map((session) => {
    const isCurrent = session.id === currentSessionId;
    const isRevoking = pendingSessionId === session.id;
    return <div key={session.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-sm font-medium">{session.userAgent ?? t("sessions.unknownDevice")}</span>
        <span className="text-xs leading-5 text-muted-foreground"><span className="font-mono">{session.id.slice(0, 8)}…</span> • {session.ipAddress ?? t("sessions.unknownIp")} • {t("sessions.expiresAt", { date: dateFormatter.format(new Date(session.expiresAt)) })}</span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {isCurrent ? <Badge variant="secondary">{t("sessions.current")}</Badge> : null}
        <Button size="sm" variant="outline" disabled={isCurrent || isRevoking} onClick={() => onRevoke(session.id)}>{isRevoking ? t("sessions.revoking") : t("sessions.revoke")}</Button>
      </div>
    </div>;
  })}</div>;
}
`;
}

export function settingsSessionsCardContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SessionList } from "./session-list";
import { useIdentitySessions, type IdentitySessionsInitialState } from "../sessions";

export function SessionsCard(initialState: IdentitySessionsInitialState): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const state = useIdentitySessions(initialState);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle as="h2">{t("sessions.title")}</CardTitle><Badge variant="secondary">{state.sessions.length}</Badge></div>
        <CardDescription className="max-w-[60ch]">{t("sessions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.error ? <Alert variant="destructive"><AlertTitle>{t("sessions.errorTitle")}</AlertTitle><AlertDescription>{state.error instanceof Error ? state.error.message : t("sessions.genericError")}</AlertDescription></Alert> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={state.refresh} disabled={state.isRefreshing}>{state.isRefreshing ? t("sessions.loading") : t("sessions.refresh")}</Button>
          <Button size="sm" variant="destructive" onClick={state.revokeOtherSessions} disabled={state.sessions.length <= 1 || state.isRevokingOthers}>{state.isRevokingOthers ? t("sessions.revokingOthers") : t("sessions.revokeOthers")}</Button>
        </div>
        <SessionList
          currentSessionId={state.currentSessionId}
          isLoading={state.isLoading}
          pendingSessionId={state.pendingSessionId}
          sessions={state.sessions}
          onRevoke={state.revokeSession}
        />
      </CardContent>
    </Card>
  );
}
`;
}

export function settingsSessionsCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/sessions-card.tsx",
    settingsSessionsCardContent(),
  );
}

export function settingsSessionsList(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/session-list.tsx",
    settingsSessionsListContent(),
  );
}
