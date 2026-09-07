// @allow-long 360: cohesive persistence adapter keeps ownership and unique-token transactions auditable
import type { ProjectMode } from "../../../lib/addons.js";

export function postgresNotificationAdapterContent(mode: ProjectMode): string {
  const databaseImport =
    mode === "monorepo"
      ? `import { db, notificationDeviceTokens, notifications } from "@repo/database";`
      : `import { db } from "@/server/db";
import { notificationDeviceTokens, notifications } from "@/server/db/schema/notifications";`;
  const serviceImport =
    mode === "monorepo" ? "../../../../notifications/index.js" : "@/server/services/notifications";
  return `// @allow-long 340: ownership-scoped Postgres notification persistence and token transaction
import "server-only";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
${databaseImport}
import {
  definePostgresNotificationAdapter,
  type NotificationDeviceRegistration,
  type NotificationRecord,
} from "${serviceImport}";
import { assertNotificationTokenFingerprint, protectNotificationDeviceToken } from "./token-protection";

type NotificationRow = typeof notifications.$inferSelect;
type DeviceRow = typeof notificationDeviceTokens.$inferSelect;

function notificationData(value: unknown): NotificationRecord["data"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).filter((entry): entry is [string, string | number | boolean | null] => {
    const candidate = entry[1];
    return candidate === null || ["string", "number", "boolean"].includes(typeof candidate);
  });
  return Object.fromEntries(entries);
}

function toNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href,
    data: notificationData(row.data),
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

function toDevice(row: DeviceRow): NotificationDeviceRegistration {
  const platform = row.platform;
  if (platform !== "web" && platform !== "ios" && platform !== "android") {
    throw new Error("Invalid notification device platform in storage");
  }
  return {
    id: row.id,
    userId: row.userId,
    platform,
    tokenFingerprint: row.tokenFingerprint,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    disabledAt: row.disabledAt,
  };
}

interface InboxCursor { createdAt: string; id: string }

function decodeCursor(value: string | undefined): InboxCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") throw new Error("invalid cursor");
    const createdAt = Reflect.get(parsed, "createdAt");
    const id = Reflect.get(parsed, "id");
    if (typeof createdAt !== "string" || !Number.isFinite(new Date(createdAt).getTime()) || typeof id !== "string") {
      throw new Error("invalid cursor");
    }
    return { createdAt, id };
  } catch {
    throw new Error("Invalid notification inbox cursor");
  }
}

function encodeCursor(row: NotificationRow): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), "utf8").toString("base64url");
}

export const postgresNotificationAdapter = definePostgresNotificationAdapter({
  kind: "postgres" as const,

  async createOwned(input) {
    const rows = await db
      .insert(notifications)
      .values(input)
      .returning();
    if (!rows[0]) throw new Error("Notification insert returned no row");
    return toNotification(rows[0]);
  },

  async listInbox(input) {
    const cursor = decodeCursor(input.cursor);
    const cursorPredicate = cursor
      ? or(
          lt(notifications.createdAt, new Date(cursor.createdAt)),
          and(eq(notifications.createdAt, new Date(cursor.createdAt)), lt(notifications.id, cursor.id)),
        )
      : undefined;
    const rows = await db
      .select()
      .from(notifications)
      .where(and(
        eq(notifications.userId, input.userId),
        input.unreadOnly ? isNull(notifications.readAt) : undefined,
        cursorPredicate,
      ))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: page.map(toNotification),
      nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]!) : null,
    };
  },

  async markReadOwned(input) {
    const changed = await db
      .update(notifications)
      .set({ readAt: input.readAt })
      .where(and(
        eq(notifications.id, input.notificationId),
        eq(notifications.userId, input.userId),
        isNull(notifications.readAt),
      ))
      .returning();
    if (changed[0]) return { value: toNotification(changed[0]), changed: true };
    const existing = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, input.userId)))
      .limit(1);
    return existing[0] ? { value: toNotification(existing[0]), changed: false } : null;
  },

  async registerDeviceOwned(input) {
    assertNotificationTokenFingerprint(input.pushToken, input.tokenFingerprint);
    const encryptedToken = protectNotificationDeviceToken(input.pushToken);
    return await db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(notificationDeviceTokens)
        .values({
          userId: input.userId,
          platform: input.platform,
          encryptedToken,
          tokenFingerprint: input.tokenFingerprint,
          createdAt: input.registeredAt,
          lastSeenAt: input.registeredAt,
        })
        .onConflictDoNothing({ target: notificationDeviceTokens.tokenFingerprint })
        .returning();
      if (inserted[0]) {
        return { kind: "registered" as const, result: { value: toDevice(inserted[0]), changed: true } };
      }
      const existing = await transaction
        .select()
        .from(notificationDeviceTokens)
        .where(eq(notificationDeviceTokens.tokenFingerprint, input.tokenFingerprint))
        .limit(1)
        .for("update");
      const current = existing[0];
      if (!current) throw new Error("Notification device unique-key race did not resolve");
      if (current.userId !== input.userId) return { kind: "owned-by-other-actor" as const };
      const wasChanged = current.platform !== input.platform || current.disabledAt !== null;
      const refreshed = await transaction
        .update(notificationDeviceTokens)
        .set({ platform: input.platform, encryptedToken, lastSeenAt: input.registeredAt, disabledAt: null })
        .where(and(
          eq(notificationDeviceTokens.id, current.id),
          eq(notificationDeviceTokens.userId, input.userId),
        ))
        .returning();
      if (!refreshed[0]) throw new Error("Notification device ownership changed during refresh");
      return { kind: "refreshed" as const, result: { value: toDevice(refreshed[0]), changed: wasChanged } };
    });
  },
});
`;
}
