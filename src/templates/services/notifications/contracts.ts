import { notificationsServerOnly } from "./shared.js";

export function notificationsContractsContent(): string {
  return `${notificationsServerOnly}
export const NOTIFICATION_DEVICE_PLATFORMS = ["web", "ios", "android"] as const;
export type NotificationDevicePlatform = (typeof NOTIFICATION_DEVICE_PLATFORMS)[number];

export interface NotificationActor {
  userId: string;
}

export interface NotificationPublishInput {
  kind: string;
  title: string;
  body: string;
  href?: string;
  data?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  data: Readonly<Record<string, string | number | boolean | null>>;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationInboxPage {
  items: NotificationRecord[];
  nextCursor: string | null;
}

/** Push tokens are write-only and are never exposed by this DTO. */
export interface NotificationDeviceRegistration {
  id: string;
  userId: string;
  platform: NotificationDevicePlatform;
  tokenFingerprint: string;
  createdAt: Date;
  lastSeenAt: Date;
  disabledAt: Date | null;
}

export interface NotificationMutationResult<T> {
  value: T;
  changed: boolean;
}
`;
}
