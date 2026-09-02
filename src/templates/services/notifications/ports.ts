import { notificationsServerOnly } from "./shared.js";

export function notificationsPortsContent(): string {
  return `${notificationsServerOnly}
import type {
  NotificationDevicePlatform,
  NotificationDeviceRegistration,
  NotificationInboxPage,
  NotificationMutationResult,
} from "./contracts.js";

export type RegisterNotificationDeviceResult =
  | { kind: "registered" | "refreshed"; result: NotificationMutationResult<NotificationDeviceRegistration> }
  | { kind: "owned-by-other-actor" };

export interface NotificationRepositoryPort {
  createOwned(input: {
    userId: string;
    kind: string;
    title: string;
    body: string;
    href: string | null;
    data: Readonly<Record<string, string | number | boolean | null>>;
    createdAt: Date;
  }): Promise<import("./contracts.js").NotificationRecord>;

  listInbox(input: {
    userId: string;
    limit: number;
    cursor?: string;
    unreadOnly: boolean;
  }): Promise<NotificationInboxPage>;

  /**
   * This must be one ownership-scoped atomic update. A missing or foreign row
   * returns null, so a read followed by an update cannot create a TOCTOU hole.
   */
  markReadOwned(input: {
    notificationId: string;
    userId: string;
    readAt: Date;
  }): Promise<NotificationMutationResult<import("./contracts.js").NotificationRecord> | null>;

  /**
   * Enforce a unique token fingerprint atomically. A token already registered
   * to another actor must return owned-by-other-actor and must never be moved.
   * Treat pushToken as a secret: never log it and encrypt it at rest.
   */
  registerDeviceOwned(input: {
    userId: string;
    platform: NotificationDevicePlatform;
    pushToken: string;
    tokenFingerprint: string;
    registeredAt: Date;
  }): Promise<RegisterNotificationDeviceResult>;
}

/** The composition root supplies a cryptographic, non-reversible fingerprint. */
export interface NotificationDeviceTokenPort {
  fingerprint(pushToken: string): Promise<string> | string;
}
`;
}
