export function convexManualSchemaContent(): string {
  return `  manual_payments: defineTable({
    ownerId: v.id("users"),
    amountMinor: v.number(),
    currency: v.literal("DZD"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    method: v.string(),
    reference: v.optional(v.string()),
    requestKey: v.string(),
    receiptStorageId: v.id("_storage"),
    receiptSha256: v.string(),
    receiptMimeType: v.string(),
    receiptOriginalName: v.string(),
    receiptBytes: v.number(),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewerId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  }).index("by_owner_request", ["ownerId", "requestKey"])
    .index("by_receipt_hash", ["receiptSha256"])
    .index("by_receipt_storage", ["receiptStorageId"])
    .index("by_reviewer", ["reviewerId"])
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_status_created", ["status", "createdAt"]),

  manual_receipt_uploads: defineTable({
    ownerId: v.id("users"), requestKey: v.string(), receiptSha256: v.string(),
    fingerprint: v.string(), token: v.string(), createdAt: v.number(), expiresAt: v.number(),
  }).index("by_owner_request", ["ownerId", "requestKey"])
    .index("by_owner_expires", ["ownerId", "expiresAt"])
    .index("by_hash", ["receiptSha256"]),

  manual_credit_ledger: defineTable({
    paymentId: v.id("manual_payments"),
    ownerId: v.id("users"),
    amountMinor: v.number(),
    currency: v.literal("DZD"),
    reviewerId: v.id("users"),
    createdAt: v.number(),
  }).index("by_payment", ["paymentId"]).index("by_owner", ["ownerId"]).index("by_reviewer", ["reviewerId"]),

  manual_wallets: defineTable({
    ownerId: v.id("users"),
    currency: v.literal("DZD"),
    balanceMinor: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),`;
}
