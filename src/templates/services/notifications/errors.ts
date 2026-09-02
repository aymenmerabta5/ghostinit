import { notificationsServerOnly } from "./shared.js";

export function notificationsErrorsContent(): string {
  return `${notificationsServerOnly}
export const NOTIFICATION_ERROR_CODES = [
  "NOTIFICATION_UNAUTHENTICATED",
  "NOTIFICATION_NOT_FOUND",
  "NOTIFICATION_INVALID_CONTENT",
  "NOTIFICATION_INVALID_DEVICE_TOKEN",
  "NOTIFICATION_DEVICE_TOKEN_PROCESSING_FAILED",
  "NOTIFICATION_DEVICE_OWNED_BY_OTHER_ACTOR",
  "NOTIFICATION_PERSISTENCE_FAILED",
] as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

export class NotificationError<TCode extends NotificationErrorCode = NotificationErrorCode> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "NotificationError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function isNotificationError(error: unknown): error is NotificationError {
  return error instanceof NotificationError;
}
`;
}
