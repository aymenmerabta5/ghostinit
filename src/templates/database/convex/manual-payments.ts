export function convexManualPaymentsContent(): string {
  return `import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireActor, requireAdminActor } from "./lib/auth";
import { manualPaymentConfig } from "./manualPaymentConfig";

const MAX_AMOUNT = 100_000_000;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const MAX_PENDING = 10;
const MAX_RECEIPTS = 1000;

type DatabaseCtx = QueryCtx | MutationCtx;
type Payment = Doc<"manual_payments">;
export const submissionArgs = {
  amountMinor: v.number(), requestKey: v.string(), method: v.string(), reference: v.optional(v.string()),
  receiptSha256: v.string(), receiptMimeType: v.string(), receiptOriginalName: v.string(), receiptBytes: v.number(),
};
export interface Submission {
  amountMinor: number; requestKey: string; method: string; reference?: string;
  receiptSha256: string; receiptMimeType: string; receiptOriginalName: string; receiptBytes: number;
}

export async function requireManualActor(ctx: DatabaseCtx, admin = false) {
  const actor = admin ? await requireAdminActor(ctx) : await requireActor(ctx);
  if (!actor.emailVerified) throw new ConvexError({ code: "FORBIDDEN", message: "An active verified account is required" });
  return actor;
}

function invalid(message: string): never { throw new ConvexError({ code: "INVALID_INPUT", message }); }
export function paymentDto(row: Payment) {
  return {
    id: row._id, ownerId: row.ownerId, amountMinor: row.amountMinor, currency: row.currency,
    status: row.status, method: row.method, reference: row.reference ?? null,
    createdAt: new Date(row.createdAt).toISOString(), reviewedAt: row.reviewedAt === undefined ? null : new Date(row.reviewedAt).toISOString(),
    reviewerId: row.reviewerId ?? null, reason: row.reason ?? null,
  };
}

export function validateSubmission(input: Submission): void {
  if (!manualPaymentConfig.enabled || !manualPaymentConfig.receiverInstructions.trim()) {
    throw new ConvexError({ code: "NOT_CONFIGURED", message: "Manual payment instructions have not been configured" });
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1 || input.amountMinor > MAX_AMOUNT) invalid("Invalid DZD amount");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.requestKey)) invalid("Invalid request key");
  if (!manualPaymentConfig.allowedMethods.includes(input.method)) invalid("Unsupported payment method");
  if (input.reference !== undefined && (input.reference !== input.reference.trim() || input.reference.length > 160)) invalid("Invalid payment reference");
  if (!Number.isSafeInteger(input.receiptBytes) || input.receiptBytes < 8 || input.receiptBytes > MAX_RECEIPT_BYTES) invalid("Invalid receipt size");
  if (!["image/png", "image/jpeg", "application/pdf"].includes(input.receiptMimeType)) invalid("Unsupported receipt format");
  if (!/^[a-f0-9]{64}$/.test(input.receiptSha256)) invalid("Invalid receipt digest");
  if (!input.receiptOriginalName.trim() || input.receiptOriginalName.length > 200 || Array.from(input.receiptOriginalName).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || code === 47 || code === 92;
  })) invalid("Invalid receipt filename");
}

export async function existingSubmission(ctx: DatabaseCtx, ownerId: Id<"users">, input: Submission) {
  const existing = await ctx.db.query("manual_payments").withIndex("by_owner_request", q => q.eq("ownerId", ownerId).eq("requestKey", input.requestKey)).unique();
  if (existing && (existing.amountMinor !== input.amountMinor || existing.method !== input.method || (existing.reference ?? "") !== (input.reference ?? "") || existing.receiptSha256 !== input.receiptSha256 || existing.receiptMimeType !== input.receiptMimeType || existing.receiptOriginalName !== input.receiptOriginalName)) {
    throw new ConvexError({ code: "CONFLICT", message: "This request key already identifies another payment" });
  }
  return existing;
}

export async function requireCapacity(ctx: DatabaseCtx, ownerId: Id<"users">): Promise<void> {
  const pending = await ctx.db.query("manual_payments").withIndex("by_owner_status", q => q.eq("ownerId", ownerId).eq("status", "pending")).take(MAX_PENDING);
  if (pending.length >= MAX_PENDING) throw new ConvexError({ code: "LIMIT_EXCEEDED", message: "Wait for a pending payment to be reviewed" });
  const receipts = await ctx.db.query("manual_payments").withIndex("by_owner_created", q => q.eq("ownerId", ownerId)).take(MAX_RECEIPTS);
  if (receipts.length >= MAX_RECEIPTS) throw new ConvexError({ code: "LIMIT_EXCEEDED", message: "Receipt retention limit reached; contact an administrator" });
}

export function submissionFingerprint(input: Submission): string {
  return JSON.stringify([input.amountMinor, input.method, input.reference ?? "", input.receiptSha256, input.receiptMimeType, input.receiptOriginalName]);
}

export async function requireUnusedReceipt(ctx: DatabaseCtx, digest: string): Promise<void> {
  const used = await ctx.db.query("manual_payments").withIndex("by_receipt_hash", q => q.eq("receiptSha256", digest)).first();
  if (used) throw new ConvexError({ code: "CONFLICT", message: "This receipt has already been submitted" });
}

export const summary = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireManualActor(ctx);
    const wallet = await ctx.db.query("manual_wallets").withIndex("by_owner", q => q.eq("ownerId", actor._id)).unique();
    return {
      enabled: manualPaymentConfig.enabled && !!manualPaymentConfig.receiverInstructions.trim() && manualPaymentConfig.allowedMethods.length > 0, currency: "DZD" as const,
      balanceMinor: wallet?.balanceMinor ?? 0, receiverInstructions: manualPaymentConfig.receiverInstructions,
      allowedMethods: manualPaymentConfig.allowedMethods,
    };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireManualActor(ctx);
    const rows = await ctx.db.query("manual_payments").withIndex("by_owner_created", q => q.eq("ownerId", actor._id)).order("desc").take(100);
    return { items: rows.map(paymentDto) };
  },
});

export const reviewQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireManualActor(ctx, true);
    const rows = await ctx.db.query("manual_payments").withIndex("by_status_created", q => q.eq("status", "pending")).order("asc").take(100);
    return { items: rows.map(paymentDto) };
  },
});

// Only the authenticated HTTP action can supply a receipt that passed byte validation.
export const submit = internalMutation({
  args: { ...submissionArgs, receiptStorageId: v.id("_storage"), uploadId: v.id("manual_receipt_uploads"), uploadToken: v.string() },
  handler: async (ctx, input) => {
    // Reload identity in the transaction: bans and concurrent requests cannot bypass the limit.
    const actor = await requireManualActor(ctx);
    validateSubmission(input);
    const existing = await existingSubmission(ctx, actor._id, input);
    if (existing) return { payment: paymentDto(existing), attached: existing.receiptStorageId === input.receiptStorageId };
    const upload = await ctx.db.get(input.uploadId);
    if (!upload || upload.ownerId !== actor._id || upload.token !== input.uploadToken || upload.expiresAt <= Date.now() || upload.fingerprint !== submissionFingerprint(input)) {
      throw new ConvexError({ code: "CONFLICT", message: "Upload admission has expired; retry the payment" });
    }
    await requireCapacity(ctx, actor._id);
    await requireUnusedReceipt(ctx, input.receiptSha256);
    const metadata = await ctx.db.system.get(input.receiptStorageId);
    if (!metadata || metadata.size !== input.receiptBytes || metadata.contentType !== input.receiptMimeType + ";gi-manual-upload=" + upload.token) invalid("Receipt storage metadata mismatch");
    const { uploadId: _uploadId, uploadToken: _uploadToken, ...paymentInput } = input;
    const id = await ctx.db.insert("manual_payments", { ...paymentInput, ownerId: actor._id, currency: "DZD", status: "pending", createdAt: Date.now() });
    await ctx.db.delete(upload._id);
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Payment insertion failed");
    return { payment: paymentDto(row), attached: true };
  },
});

export const receipt = internalQuery({
  args: { id: v.id("manual_payments") },
  handler: async (ctx, input) => {
    const actor = await requireManualActor(ctx);
    const row = await ctx.db.get(input.id);
    if (!row || (row.ownerId !== actor._id && actor.role !== "admin")) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Receipt not found" });
    }
    return { storageId: row.receiptStorageId, mimeType: row.receiptMimeType, originalName: row.receiptOriginalName };
  },
});

export const review = mutation({
  args: { id: v.id("manual_payments"), decision: v.union(v.literal("approved"), v.literal("rejected")), reason: v.optional(v.string()) },
  handler: async (ctx, input) => {
    const reviewer = await requireManualActor(ctx, true);
    const row = await ctx.db.get(input.id);
    if (!row) throw new ConvexError({ code: "NOT_FOUND", message: "Payment not found" });
    if (row.ownerId === reviewer._id) throw new ConvexError({ code: "FORBIDDEN", message: "You cannot review your own payment" });
    const reason = input.reason?.trim() || undefined;
    if ((input.decision === "rejected" && !reason) || (reason?.length ?? 0) > 500) invalid("A rejection reason is required (maximum 500 characters)");
    if (row.status !== "pending") {
      if (row.status === input.decision) return paymentDto(row);
      throw new ConvexError({ code: "CONFLICT", message: "This payment has already been reviewed" });
    }
    const now = Date.now();
    if (input.decision === "approved") {
      if (!Number.isSafeInteger(row.amountMinor) || row.amountMinor < 1 || row.amountMinor > MAX_AMOUNT) invalid("Stored amount is invalid");
      const previousCredit = await ctx.db.query("manual_credit_ledger").withIndex("by_payment", q => q.eq("paymentId", row._id)).unique();
      if (previousCredit) throw new ConvexError({ code: "CONFLICT", message: "Payment has already been credited" });
      const wallet = await ctx.db.query("manual_wallets").withIndex("by_owner", q => q.eq("ownerId", row.ownerId)).unique();
      const balanceMinor = (wallet?.balanceMinor ?? 0) + row.amountMinor;
      if (!Number.isSafeInteger(balanceMinor)) invalid("Balance limit exceeded");
      await ctx.db.insert("manual_credit_ledger", { paymentId: row._id, ownerId: row.ownerId, amountMinor: row.amountMinor, currency: "DZD", reviewerId: reviewer._id, createdAt: now });
      if (wallet) await ctx.db.patch(wallet._id, { balanceMinor, updatedAt: now });
      else await ctx.db.insert("manual_wallets", { ownerId: row.ownerId, currency: "DZD", balanceMinor, updatedAt: now });
    }
    // Convex retries conflicting transactions, so status, unique credit and balance commit together.
    await ctx.db.patch(row._id, { status: input.decision, reviewedAt: now, reviewerId: reviewer._id, reason });
    return paymentDto({ ...row, status: input.decision, reviewedAt: now, reviewerId: reviewer._id, reason });
  },
});
`;
}
