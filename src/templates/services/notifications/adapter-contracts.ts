import { notificationsServerOnly } from "./shared.js";

export function notificationsAdapterContractsContent(): string {
  return `${notificationsServerOnly}
import type { NotificationRepositoryPort } from "./ports.js";

export interface PostgresNotificationAdapter extends NotificationRepositoryPort {
  readonly kind: "postgres";
}

export interface ConvexNotificationAdapter extends NotificationRepositoryPort {
  readonly kind: "convex";
}

export function definePostgresNotificationAdapter<T extends PostgresNotificationAdapter>(adapter: T): T {
  return adapter;
}

export function defineConvexNotificationAdapter<T extends ConvexNotificationAdapter>(adapter: T): T {
  return adapter;
}

export type NotificationAdapterParity =
  Exclude<keyof PostgresNotificationAdapter, "kind"> extends Exclude<keyof ConvexNotificationAdapter, "kind">
    ? Exclude<keyof ConvexNotificationAdapter, "kind"> extends Exclude<keyof PostgresNotificationAdapter, "kind">
      ? true
      : never
    : never;
`;
}
