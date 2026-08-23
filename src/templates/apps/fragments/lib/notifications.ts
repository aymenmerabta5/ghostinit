import { file, type TemplateFile } from "../../../shared.js";

// Generic notification formatting — no domain copy. Starter is app-agnostic: titles are
// derived from type via humanize, with an empty extensible map for your domain.
export function notificationsLibFiles(base = "apps/web/src"): TemplateFile[] {
  const libContent = `export interface FormattedNotification {
  title: string;
  message: string | null;
}

export interface NotificationDestination {
  href: string;
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

export function getNotificationHref(_type: string, payload: unknown): NotificationDestination {
  const rec = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (typeof rec.href === "string") return { href: rec.href };
  return { href: "/dashboard/notifications" };
}
`;

  const bellComponent = `"use client";
import { Bell } from "lucide-react";
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
import { formatNotification } from "@/lib/notifications";

export interface NotificationItem {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export function NotificationBell({ notifications, onMarkRead }: { notifications: NotificationItem[]; onMarkRead?: (id: string) => void }) {
  const unread = notifications.filter((notification) => notification.readAt === null).length;
  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="icon" className="relative" aria-label="Notifications" />}
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
          <PopoverTitle>Notifications</PopoverTitle>
          <PopoverDescription>Review recent account activity.</PopoverDescription>
        </div>
        {notifications.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No notifications</EmptyTitle>
              <EmptyDescription>New account activity will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto pt-3">
            {notifications.map((notification) => {
              const formatted = formatNotification(notification.type, notification.payload);
              return (
                <Button
                  key={notification.id}
                  type="button"
                  variant="ghost"
                  disabled={notification.readAt !== null}
                  onClick={() => onMarkRead?.(notification.id)}
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
