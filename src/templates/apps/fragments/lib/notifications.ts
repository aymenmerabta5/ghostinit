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

export interface NotificationItem {
  id: string;
  type: string;
  payload: unknown;
  readAt: string | Date | null;
  createdAt: string | Date;
}

export function NotificationBell({ notifications, onMarkRead }: { notifications: NotificationItem[]; onMarkRead?: (id: string) => void }) {
  const unread = notifications.filter((n) => !n.readAt).length;
  const firstUnread = notifications.find((n) => !n.readAt);
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label="Notifications" onClick={() => firstUnread && onMarkRead?.(firstUnread.id)}>
        <Bell className="size-5" />
        {unread > 0 && <Badge className="absolute -top-1 -end-1 size-5 rounded-full p-0 text-xs flex items-center justify-center">{unread > 9 ? "9+" : unread}</Badge>}
      </Button>
    </div>
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
