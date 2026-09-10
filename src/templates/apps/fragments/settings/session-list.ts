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

const SESSION_BROWSERS = [
  ["Edge", ["edg/", "edge/", "edga/", "edgios/"]],
  ["Opera", ["opr/", "opios/", "opera/"]],
  ["Samsung Internet", ["samsungbrowser/"]],
  ["Firefox", ["firefox/", "fxios/"]],
  ["Chrome", ["chrome/", "chromium/", "crios/"]],
  ["Safari", ["safari/"]],
] as const;
const SESSION_PLATFORMS = [
  ["Android", ["android"]], ["iOS", ["iphone", "ipad", "ipod"]],
  ["Windows", ["windows"]], ["ChromeOS", ["cros"]],
  ["macOS", ["macintosh", "mac os x"]], ["Linux", ["linux"]],
] as const;

export function sessionDevice(userAgent: string | null | undefined) {
  const value = (userAgent ?? "").toLowerCase();
  // User-agent labels are display hints; session admission never depends on them.
  return {
    browser: SESSION_BROWSERS.find(([, tokens]) => tokens.some((token) => value.includes(token)))?.[0] ?? null,
    platform: SESSION_PLATFORMS.find(([, tokens]) => tokens.some((token) => value.includes(token)))?.[0] ?? null,
  };
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
    const device = sessionDevice(session.userAgent);
    const ipAddress = session.ipAddress?.trim();
    const deviceLabel = device.browser && device.platform
      ? t("sessions.deviceSummary", { browser: device.browser, platform: device.platform })
      : device.browser ?? device.platform ?? t("sessions.unknownDevice");
    return <div key={session.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-sm font-medium"><bdi>{deviceLabel}</bdi></span>
        <span className="text-xs leading-5 text-muted-foreground">{ipAddress ? <><bdi>{ipAddress}</bdi>{" • "}</> : null}{t("sessions.expiresAt", { date: dateFormatter.format(new Date(session.expiresAt)) })}</span>
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
