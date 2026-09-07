import { notificationsServerOnly } from "./shared.js";

export function notificationsServiceContent(): string {
  return `${notificationsServerOnly}
import { NotificationError, isNotificationError } from "./errors.js";
import type { NotificationActor, NotificationDevicePlatform, NotificationPublishInput } from "./contracts.js";
import type { NotificationDeviceTokenPort, NotificationRepositoryPort } from "./ports.js";

export interface NotificationServiceDependencies {
  repository: NotificationRepositoryPort;
  deviceTokens: NotificationDeviceTokenPort;
  now?: () => Date;
}

function requireActor(actor: NotificationActor): void {
  if (!actor.userId.trim()) {
    throw new NotificationError("NOTIFICATION_UNAUTHENTICATED", "Authentication is required");
  }
}

function normalizePublishInput(input: NotificationPublishInput) {
  const kind = input.kind.trim();
  const title = input.title.trim();
  const body = input.body.trim();
  const href = input.href?.trim() || null;
  const data = input.data ?? {};
  if (!/^[a-z][a-z0-9._-]{0,127}$/.test(kind)) {
    throw new NotificationError("NOTIFICATION_INVALID_CONTENT", "Notification kind is invalid");
  }
  if (!title || title.length > 160 || body.length > 2_000) {
    throw new NotificationError("NOTIFICATION_INVALID_CONTENT", "Notification content is invalid");
  }
  if (href !== null && (!href.startsWith("/") || href.startsWith("//") || href.length > 512)) {
    throw new NotificationError("NOTIFICATION_INVALID_CONTENT", "Notification destination is invalid");
  }
  const entries = Object.entries(data);
  if (entries.length > 50 || entries.some(([key]) => !/^[a-zA-Z0-9_.-]{1,64}$/.test(key))) {
    throw new NotificationError("NOTIFICATION_INVALID_CONTENT", "Notification data is invalid");
  }
  return { kind, title, body, href, data };
}

async function persist<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isNotificationError(error)) throw error;
    throw new NotificationError(
      "NOTIFICATION_PERSISTENCE_FAILED",
      "The notification operation could not be committed",
      { cause: error },
    );
  }
}

export function createNotificationService({
  repository,
  deviceTokens,
  now = () => new Date(),
}: NotificationServiceDependencies) {
  return {
    async publish(actor: NotificationActor, input: NotificationPublishInput) {
      requireActor(actor);
      const normalized = normalizePublishInput(input);
      return await persist(async () =>
        await repository.createOwned({
          userId: actor.userId,
          ...normalized,
          createdAt: now(),
        }),
      );
    },
    async listInbox(
      actor: NotificationActor,
      input: { limit?: number; cursor?: string; unreadOnly?: boolean } = {},
    ) {
      requireActor(actor);
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
      return await persist(async () =>
        await repository.listInbox({
          userId: actor.userId,
          limit,
          cursor: input.cursor,
          unreadOnly: input.unreadOnly === true,
        }),
      );
    },

    async markRead(actor: NotificationActor, notificationId: string) {
      requireActor(actor);
      const normalizedNotificationId = notificationId.trim();
      if (!normalizedNotificationId || normalizedNotificationId.length > 128) {
        throw new NotificationError("NOTIFICATION_INVALID_CONTENT", "Notification id is invalid");
      }
      const result = await persist(async () =>
        await repository.markReadOwned({
          notificationId: normalizedNotificationId,
          userId: actor.userId,
          readAt: now(),
        }),
      );
      if (!result) {
        throw new NotificationError("NOTIFICATION_NOT_FOUND", "Notification not found");
      }
      return result;
    },

    async registerDevice(
      actor: NotificationActor,
      input: { platform: NotificationDevicePlatform; pushToken: string },
    ) {
      requireActor(actor);
      const pushToken = input.pushToken.trim();
      if (pushToken.length < 16 || pushToken.length > 4096) {
        throw new NotificationError(
          "NOTIFICATION_INVALID_DEVICE_TOKEN",
          "The device token is invalid",
        );
      }
      let tokenFingerprint: string;
      try {
        tokenFingerprint = await deviceTokens.fingerprint(pushToken);
      } catch (error) {
        throw new NotificationError(
          "NOTIFICATION_DEVICE_TOKEN_PROCESSING_FAILED",
          "The device token could not be protected",
          { cause: error },
        );
      }
      if (!tokenFingerprint || tokenFingerprint === pushToken) {
        throw new NotificationError(
          "NOTIFICATION_INVALID_DEVICE_TOKEN",
          "The device token fingerprint is invalid",
        );
      }
      const registered = await persist(async () =>
        await repository.registerDeviceOwned({
          userId: actor.userId,
          platform: input.platform,
          pushToken,
          tokenFingerprint,
          registeredAt: now(),
        }),
      );
      if (registered.kind === "owned-by-other-actor") {
        throw new NotificationError(
          "NOTIFICATION_DEVICE_OWNED_BY_OTHER_ACTOR",
          "The device is already registered to another account",
        );
      }
      return registered.result;
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
`;
}
