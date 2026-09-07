export function postgresNotificationsSchemaContent(): string {
  return `import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    data: jsonb("data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt, table.id),
    index("notifications_user_read_created_idx").on(table.userId, table.readAt, table.createdAt),
  ],
);

export const notificationDeviceTokens = pgTable(
  "notification_device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    tokenFingerprint: text("token_fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notification_devices_fingerprint_uidx").on(table.tokenFingerprint),
    index("notification_devices_user_idx").on(table.userId, table.disabledAt),
  ],
);
`;
}

export function convexNotificationsSchemaContent(): string {
  return `import { defineTable } from "convex/server";
import { v } from "convex/values";

const notificationDataValue = v.union(v.string(), v.number(), v.boolean(), v.null());

/** Spread this object into the root defineSchema call. */
export const notificationTables = {
  notifications: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    href: v.optional(v.string()),
    data: v.record(v.string(), notificationDataValue),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_read_created", ["userId", "readAt", "createdAt"]),
  notificationDeviceTokens: defineTable({
    userId: v.id("users"),
    platform: v.union(v.literal("web"), v.literal("ios"), v.literal("android")),
    encryptedToken: v.string(),
    tokenFingerprint: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    disabledAt: v.optional(v.number()),
  })
    .index("by_fingerprint", ["tokenFingerprint"])
    .index("by_user_disabled", ["userId", "disabledAt"]),
};
`;
}
