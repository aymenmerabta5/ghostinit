export function postgresStorageSchemaContent(): string {
  return `import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const storedObjects = pgTable(
  "stored_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").unique(),
    status: text("status").notNull().default("ready"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    originalName: text("original_name").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stored_objects_owner_created_idx").on(table.ownerId, table.createdAt),
    index("stored_objects_owner_status_idx").on(table.ownerId, table.status),
    index("stored_objects_pending_expiry_idx").on(table.status, table.expiresAt),
    check("stored_objects_byte_size_chk", sql\`\${table.byteSize} > 0\`),
    check("stored_objects_status_chk", sql\`\${table.status} in ('pending', 'ready')\`),
    check(
      "stored_objects_lifecycle_chk",
      sql\`(\${table.status} = 'pending' and \${table.expiresAt} is not null) or (\${table.status} = 'ready' and \${table.storageKey} is not null and \${table.expiresAt} is null)\`,
    ),
  ],
);

/**
 * Durable blob tombstones. Metadata is removed only in the same transaction
 * that records its opaque storage key here, so an unavailable blob backend or
 * crashed worker cannot turn a retryable deletion into a permanent orphan.
 */
export const storageBlobCleanupQueue = pgTable(
  "storage_blob_cleanup_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    source: text("source").notNull(),
    ownerId: text("owner_id"),
    byteSize: integer("byte_size"),
    attempt: integer("attempt").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("storage_blob_cleanup_claim_idx").on(table.availableAt, table.createdAt, table.id),
    index("storage_blob_cleanup_lease_idx").on(table.leaseExpiresAt),
    index("storage_blob_cleanup_owner_idx").on(table.ownerId),
    check(
      "storage_blob_cleanup_owner_bytes_pair_chk",
      sql\`(\${table.ownerId} is null) = (\${table.byteSize} is null) and (\${table.byteSize} is null or \${table.byteSize} > 0)\`,
    ),
    check(
      "storage_blob_cleanup_lease_pair_chk",
      sql\`(\${table.leaseToken} is null) = (\${table.leaseExpiresAt} is null)\`,
    ),
  ],
);
`;
}
