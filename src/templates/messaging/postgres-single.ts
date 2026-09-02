import { file, type TemplateFile } from "../shared.js";

export function singlePostgresMessagingFiles(): TemplateFile[] {
  return [
    file(
      "src/server/db/schema/messaging.ts",
      `import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { type AnyPgColumn, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sessions, users } from "./auth";

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  directKey: text("direct_key").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [index("conversations_updated_at_idx").on(table.updatedAt)]);

export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastReadAt: timestamp("last_read_at"),
}, (table) => [
  primaryKey({ columns: [table.conversationId, table.userId] }),
  index("conversation_participants_user_idx").on(table.userId, table.conversationId),
]);

export const messages = pgTable("messages", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  clientMessageKey: text("client_message_key").notNull(),
  body: text("body"),
  replyToId: text("reply_to_id").references((): AnyPgColumn => messages.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
  uniqueIndex("messages_actor_conversation_client_key_uidx").on(
    table.senderId,
    table.conversationId,
    table.clientMessageKey,
  ),
]);

export const messageAttachments = pgTable("message_attachments", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "restrict" }),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  messageId: text("message_id").references(() => messages.id, { onDelete: "restrict" }),
  storageKey: text("storage_key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  originalName: text("original_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  uploadedAt: timestamp("uploaded_at"),
}, (table) => [
  index("message_attachments_message_idx").on(table.messageId),
  index("message_attachments_owner_idx").on(table.ownerId),
  index("message_attachments_pending_owner_idx").on(table.ownerId, table.conversationId, table.expiresAt),
  index("message_attachments_expired_pending_idx")
    .on(table.expiresAt, table.id)
    .where(sql\`\${table.messageId} is null\`),
]);

export const messagingRealtimeOutbox = pgTable("messaging_realtime_outbox", {
  id: text("id").primaryKey().$defaultFn(randomUUID),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  attemptCount: integer("attempt_count").notNull().default(0),
  availableAt: timestamp("available_at").notNull().defaultNow(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  publishedAt: timestamp("published_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("messaging_realtime_outbox_message_uidx").on(table.messageId),
  index("messaging_realtime_outbox_pending_idx").on(
    table.publishedAt,
    table.availableAt,
    table.attemptCount,
  ),
  index("messaging_realtime_outbox_lease_idx").on(table.leaseExpiresAt),
]);

/** A single outstanding, short-lived native WebSocket ticket per auth session. */
export const messagingWebsocketTickets = pgTable("messaging_websocket_tickets", {
  ticketHash: text("ticket_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("messaging_websocket_tickets_session_uidx").on(table.sessionId),
  index("messaging_websocket_tickets_expires_idx").on(table.expiresAt),
]);
`,
    ),
  ];
}
