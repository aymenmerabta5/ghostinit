export function notificationsActionsContent(): string {
  return `import { createServiceORPCError } from "../utils/service-error.js";
import type { NotificationsTransportContext } from "./context.js";

const notificationErrorCodeMap = {
  APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED",
  APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN",
  NOTIFICATION_UNAUTHENTICATED: "UNAUTHORIZED",
  NOTIFICATION_NOT_FOUND: "NOT_FOUND",
  NOTIFICATION_INVALID_CONTENT: "BAD_REQUEST",
  NOTIFICATION_INVALID_DEVICE_TOKEN: "BAD_REQUEST",
  NOTIFICATION_DEVICE_TOKEN_PROCESSING_FAILED: "INTERNAL_SERVER_ERROR",
  NOTIFICATION_DEVICE_OWNED_BY_OTHER_ACTOR: "CONFLICT",
  NOTIFICATION_PERSISTENCE_FAILED: "INTERNAL_SERVER_ERROR",
} as const;

async function invokeNotification<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    return createServiceORPCError(error, { codeMap: notificationErrorCodeMap, fallbackMessage: "The notification operation failed" });
  }
}

type Call<TContext, TInput> = { context: TContext; input: TInput };

export function createNotificationActions<TContext extends NotificationsTransportContext>() {
  return {
    createSelf: async ({ context, input }: Call<TContext, { kind: string; title: string; body: string; href?: string; data?: Readonly<Record<string, string | number | boolean | null>> }>) => await invokeNotification(() => context.application.notifications.createSelf(input)),
    listInbox: async ({ context, input }: Call<TContext, { limit?: number; cursor?: string; unreadOnly?: boolean }>) => await invokeNotification(() => context.application.notifications.listInbox(input)),
    markRead: async ({ context, input }: Call<TContext, { notificationId: string }>) => await invokeNotification(() => context.application.notifications.markRead(input)),
    registerDevice: async ({ context, input }: Call<TContext, { platform: "web" | "ios" | "android"; pushToken: string }>) => await invokeNotification(() => context.application.notifications.registerDevice(input)),
  };
}
`;
}
