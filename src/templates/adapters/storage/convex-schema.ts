export function convexStorageSchemaContent(): string {
  return `import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Spread this object into the root defineSchema call. */
export const storageTables = {
  storedObjects: defineTable({
    ownerId: v.id("users"),
    storageId: v.optional(v.id("_storage")),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("cleanup")),
    mimeType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    originalName: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    cleanupAfter: v.optional(v.number()),
    cleanupAttempts: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status_expiry", ["ownerId", "status", "expiresAt"])
    .index("by_storage", ["storageId"])
    .index("by_status_expiry", ["status", "expiresAt"])
    .index("by_status_cleanup", ["status", "cleanupAfter"]),
  managedStorageBlobs: defineTable({
    token: v.string(),
    lifecycleKind: v.union(v.literal("storage"), v.literal("messaging")),
    lifecycleId: v.string(),
    expectedByteSize: v.number(),
    expectedMimeType: v.string(),
    expectedSha256: v.string(),
    managedContentType: v.string(),
    storageId: v.optional(v.id("_storage")),
    status: v.union(v.literal("reserved"), v.literal("bound"), v.literal("cleanup")),
    cleanupAfter: v.optional(v.number()),
    cleanupAttempts: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_lifecycle", ["lifecycleKind", "lifecycleId"])
    .index("by_storage", ["storageId"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_status_cleanup", ["status", "cleanupAfter"]),
  managedStorageSweepState: defineTable({
    key: v.string(),
    cursor: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    leaseUntil: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
};
`;
}
