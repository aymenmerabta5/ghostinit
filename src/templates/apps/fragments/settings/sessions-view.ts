export function sessionsViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import { SessionList } from "./session-list";
import type { IdentitySessions } from "../use-identity-sessions";
export function SessionsView({ state }: { state: IdentitySessions }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle as="h2">{t("sessions.title")}</CardTitle>{state.readSucceeded || state.sessions.length > 0 ? <Badge variant="secondary">{state.sessions.length}</Badge> : null}</div>
        <CardDescription className="max-w-[60ch]">{t("sessions.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.error ? <Alert variant="destructive"><AlertTitle>{t("sessions.errorTitle")}</AlertTitle><AlertDescription>{state.error instanceof Error ? state.error.message : t("sessions.genericError")}</AlertDescription></Alert> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={state.refresh} disabled={state.isRefreshing}>{state.isRefreshing ? t("sessions.loading") : t("sessions.refresh")}</Button>
          <Button size="sm" variant="destructive" onClick={state.revokeOtherSessions} disabled={state.sessions.length <= 1 || state.isRevokingOthers}>{state.isRevokingOthers ? t("sessions.revokingOthers") : t("sessions.revokeOthers")}</Button>
        </div>
        {state.isLoading || state.readSucceeded || state.sessions.length > 0 ? <SessionList
          currentSessionId={state.currentSessionId}
          isLoading={state.isLoading}
          pendingSessionId={state.pendingSessionId}
          sessions={state.sessions}
          onRevoke={state.revokeSession}
        /> : null}
      </CardContent>
    </Card>
  );
}
`;
}
