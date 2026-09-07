import { file, type TemplateFile } from "../../../shared.js";

export function notificationNavigationContent(): string {
  return `export const INTERNAL_NOTIFICATION_DESTINATIONS = [
  "/",
  "/dashboard",
  "/notifications",
  "/settings",
] as const;

export type NotificationDestination = (typeof INTERNAL_NOTIFICATION_DESTINATIONS)[number];

export function resolveNotificationDestination(value: unknown): NotificationDestination | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\\\")) return null;
  let parsed: URL;
  try { parsed = new URL(value, "https://ghostinit.internal"); } catch { return null; }
  if (parsed.origin !== "https://ghostinit.internal" || parsed.search || parsed.hash) return null;
  const normalized = parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
    ? parsed.pathname.slice(0, -1)
    : parsed.pathname;
  for (const destination of INTERNAL_NOTIFICATION_DESTINATIONS) {
    if (destination === normalized) return destination;
  }
  return null;
}
`;
}

// Generic notification formatting — no domain copy. Starter is app-agnostic: titles are
// derived from type via humanize, with an empty extensible map for your domain.
export function notificationsLibFiles(base = "apps/web/src"): TemplateFile[] {
  const libContent = `${notificationNavigationContent()}
export interface FormattedNotification {
  title: string;
  message: string | null;
}

export interface NotificationLink {
  href: NotificationDestination;
}

// Extend for your domain. Example:
// export const NOTIFICATION_TITLES: Record<string, string> = {
//   billing_past_due: "Payment past due",
//   team_invite: "Team invite",
// };
const NOTIFICATION_TITLES: Record<string, string> = {};

function humanize(type: string): string {
  return type.replaceAll("_", " ").replaceAll("-", " ").replace(/\\b\\w/g, (c) => c.toUpperCase());
}

export function formatNotification(type: string, payload: unknown): FormattedNotification {
  const title = NOTIFICATION_TITLES[type] ?? humanize(type);
  let message: string | null = null;
  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    if (typeof rec.message === "string") message = rec.message;
    else if (typeof rec.title === "string") message = String(rec.title);
  }
  return { title, message };
}

export function getNotificationHref(_type: string, payload: unknown): NotificationLink | null {
  const rec = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const href = resolveNotificationDestination(rec.href ?? "/notifications");
  return href ? { href } : null;
}
`;

  const bellComponent = `"use client";
import * as React from "react";
import { Bell } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatNotification, getNotificationHref, type NotificationDestination } from "@/lib/notifications";
import { useSurfaceTranslations } from "@/lib/translations";

export interface NotificationItem {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export function NotificationBell({ notifications, onMarkRead, onNavigate, loading = false, loadError = false, onRetry, captureAction }: { notifications: NotificationItem[]; onMarkRead?: (id: string) => void | Promise<void>; onNavigate?: (destination: NotificationDestination) => void; loading?: boolean; loadError?: boolean; onRetry?: () => void; captureAction?: () => () => boolean }) {
  const t = useSurfaceTranslations("notifications");
  const actionInFlight = React.useRef(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState(false);
  const unread = notifications.filter((notification) => notification.readAt === null).length;
  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="icon" className="relative" aria-label={t("title")} />}
      >
        <Bell data-icon="inline-start" aria-hidden />
        {unread > 0 ? (
          <Badge variant="secondary" className="absolute -top-1 -end-1 size-5 justify-center p-0 text-xs">
            {unread > 9 ? "9+" : unread}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-1">
          <PopoverTitle>{t("title")}</PopoverTitle>
          <PopoverDescription>{t("description")}</PopoverDescription>
        </div>
        {loadError || actionError ? <Alert variant="destructive"><AlertDescription>{t("unavailable")}{loadError && onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("retry")}</Button> : null}</AlertDescription></Alert> : null}
        {loading ? <Skeleton className="mt-3 h-24 w-full" /> : notifications.length === 0 ? loadError ? null : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("empty")}</EmptyTitle>
              <EmptyDescription>{t("description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto pt-3">
            {notifications.map((notification) => {
              const formatted = formatNotification(notification.type, notification.payload);
              const destination = getNotificationHref(notification.type, notification.payload);
              return (
                <Button
                  key={notification.id}
                  type="button"
                  variant="ghost"
                  className="data-disabled:opacity-50"
                  disabled={pendingId !== null}
                  focusableWhenDisabled
                  aria-busy={pendingId === notification.id}
                  onClick={async () => {
                    const isCurrent = captureAction?.() ?? (() => true);
                    if (actionInFlight.current || !isCurrent()) return;
                    actionInFlight.current = true;
                    setPendingId(notification.id); setActionError(false);
                    try {
                      if (notification.readAt === null) await onMarkRead?.(notification.id);
                      if (isCurrent() && destination) onNavigate?.(destination.href);
                    } catch { if (isCurrent()) setActionError(true); }
                    finally { actionInFlight.current = false; if (isCurrent()) setPendingId(null); }
                  }}
                >
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className="truncate font-medium">{formatted.title}</span>
                    {formatted.message ? (
                      <span className="line-clamp-2 text-muted-foreground">{formatted.message}</span>
                    ) : null}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
`;

  const hookContent = `"use client";
import { useMemo } from "react";
import { formatNotification } from "@/lib/notifications";

export function useNotifications(notifications: Array<{ type: string; payload: unknown; readAt: string | null }>) {
  return useMemo(() => {
    return notifications.map((n) => ({
      ...n,
      formatted: formatNotification(n.type, n.payload),
    }));
  }, [notifications]);
}
`;

  return [
    file(`${base}/lib/notifications.ts`, libContent),
    file(`${base}/components/NotificationBell.tsx`, bellComponent),
    file(`${base}/hooks/use-notifications.ts`, hookContent),
  ];
}
