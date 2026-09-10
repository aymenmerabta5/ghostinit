export function postgresManualPaymentSchemaContent(): string {
  return `import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/** Receipts belong only to this table. No public storage-object row or URL is created. */
export const manualPayments = pgTable("manual_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("DZD"),
  status: text("status").notNull().default("uploading"),
  method: text("method").notNull(),
  reference: text("reference"),
  requestKey: text("request_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  receiptKey: text("receipt_key").notNull().unique(),
  receiptHash: text("receipt_hash").notNull().unique(),
  receiptMimeType: text("receipt_mime_type").notNull(),
  receiptOriginalName: text("receipt_original_name").notNull(),
  receiptByteSize: integer("receipt_byte_size").notNull(),
  reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("manual_payments_owner_request_unique").on(table.ownerId, table.requestKey),
  index("manual_payments_owner_created_idx").on(table.ownerId, table.createdAt),
  index("manual_payments_status_created_idx").on(table.status, table.createdAt),
  check("manual_payments_amount_chk", sql\`\${table.amountMinor} between 1 and 100000000\`),
  check("manual_payments_currency_chk", sql\`\${table.currency} = 'DZD'\`),
  check("manual_payments_receipt_size_chk", sql\`\${table.receiptByteSize} between 8 and 5242880\`),
  check("manual_payments_receipt_mime_chk", sql\`\${table.receiptMimeType} in ('image/png', 'image/jpeg', 'application/pdf')\`),
  check("manual_payments_review_chk", sql\`(\${table.status} in ('uploading', 'pending') and \${table.reviewerId} is null and \${table.reviewedAt} is null and \${table.reason} is null) or (\${table.status} in ('approved', 'rejected') and \${table.reviewerId} is not null and \${table.reviewerId} <> \${table.ownerId} and \${table.reviewedAt} is not null and (\${table.status} <> 'rejected' or (\${table.reason} is not null and length(trim(\${table.reason})) > 0)))\`),
  check("manual_payments_reason_length_chk", sql\`\${table.reason} is null or length(\${table.reason}) <= 500\`),
]);

/** Append-only credits. A payment can create exactly one ledger entry. */
export const manualCreditLedger = pgTable("manual_credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").notNull().unique().references(() => manualPayments.id, { onDelete: "restrict" }),
  ownerId: text("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("DZD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("manual_credit_ledger_owner_idx").on(table.ownerId),
  check("manual_credit_ledger_amount_chk", sql\`\${table.amountMinor} between 1 and 100000000\`),
  check("manual_credit_ledger_currency_chk", sql\`\${table.currency} = 'DZD'\`),
]);
`;
}
