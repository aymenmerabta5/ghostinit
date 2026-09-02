import type { ProjectMode } from "../../../lib/addons.js";
import { notificationsServiceModule } from "./shared.js";

export function notificationsDtoContent(mode: ProjectMode): string {
  const serviceModule = notificationsServiceModule(mode);
  return `import type { NotificationDeviceRegistration, NotificationRecord } from "${serviceModule}";

export function toNotificationDto(value: NotificationRecord) {
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    body: value.body,
    href: value.href,
    data: value.data,
    createdAt: value.createdAt.toISOString(),
    readAt: value.readAt?.toISOString() ?? null,
  };
}

export function toNotificationDeviceDto(value: NotificationDeviceRegistration) {
  return {
    id: value.id,
    platform: value.platform,
    createdAt: value.createdAt.toISOString(),
    lastSeenAt: value.lastSeenAt.toISOString(),
    disabledAt: value.disabledAt?.toISOString() ?? null,
  };
}
`;
}
