export function convexManualUploadsContent(): string {
  return `import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { submissionArgs, submissionFingerprint, existingSubmission, validateSubmission, requireCapacity, requireUnusedReceipt, requireManualActor, paymentDto } from "./manualPayments";

const UPLOAD_LEASE_MS = 15 * 60 * 1000;
type Reservation = { previous: ReturnType<typeof paymentDto>; uploadId: null } | { previous: null; uploadId: Id<"manual_receipt_uploads"> };

export const reserve = internalMutation({
  args: { ...submissionArgs, uploadToken: v.string() },
  handler: async (ctx, input): Promise<Reservation> => {
    const actor = await requireManualActor(ctx);
    validateSubmission(input);
    if (!/^[a-f0-9-]{36}$/.test(input.uploadToken)) throw new Error("Invalid upload token");
    const previous = await existingSubmission(ctx, actor._id, input);
    if (previous) return { previous: paymentDto(previous), uploadId: null };
    const active = await ctx.db.query("manual_receipt_uploads").withIndex("by_owner_request", q => q.eq("ownerId", actor._id).eq("requestKey", input.requestKey)).unique();
    if (active) throw new ConvexError({ code: "CONFLICT", message: "This payment upload is already in progress; retry shortly" });
    await requireCapacity(ctx, actor._id);
    await requireUnusedReceipt(ctx, input.receiptSha256);
    const duplicate = await ctx.db.query("manual_receipt_uploads").withIndex("by_hash", q => q.eq("receiptSha256", input.receiptSha256)).first();
    if (duplicate) throw new ConvexError({ code: "CONFLICT", message: "This receipt is already being submitted" });
    const now = Date.now();
    const uploads = await ctx.db.query("manual_receipt_uploads").withIndex("by_owner_expires", q => q.eq("ownerId", actor._id).gt("expiresAt", now)).take(10);
    const pending = await ctx.db.query("manual_payments").withIndex("by_owner_status", q => q.eq("ownerId", actor._id).eq("status", "pending")).take(10);
    if (uploads.length + pending.length >= 10) throw new ConvexError({ code: "LIMIT_EXCEEDED", message: "Wait for a pending payment to be reviewed" });
    const uploadId = await ctx.db.insert("manual_receipt_uploads", {
      ownerId: actor._id, requestKey: input.requestKey, receiptSha256: input.receiptSha256,
      fingerprint: submissionFingerprint(input), token: input.uploadToken, createdAt: now, expiresAt: now + UPLOAD_LEASE_MS,
    });
    // The MIME marker lets this sweep recover a blob even if an action stops immediately after store().
    await ctx.scheduler.runAfter(UPLOAD_LEASE_MS, internal.manualPaymentUploads.expire, { uploadId, token: input.uploadToken, cursor: null });
    return { previous: null, uploadId };
  },
});

export const abandon = internalMutation({
  args: { uploadId: v.id("manual_receipt_uploads"), token: v.string(), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, input): Promise<null> => {
    // A transport error after commit is ambiguous: linkage is checked transactionally before deletion.
    if (input.storageId) {
      const attached = await ctx.db.query("manual_payments").withIndex("by_receipt_storage", q => q.eq("receiptStorageId", input.storageId!)).unique();
      if (attached) return null;
    }
    const upload = await ctx.db.get(input.uploadId);
    if (upload && upload.token !== input.token) return null;
    if (input.storageId) {
      const metadata = await ctx.db.system.get(input.storageId);
      if (metadata?.contentType?.endsWith(";gi-manual-upload=" + input.token)) await ctx.storage.delete(input.storageId);
      if (upload) await ctx.db.delete(upload._id);
    }
    // Without a returned storage ID, retain the reservation until the orphan sweep runs.
    return null;
  },
});

export const expire = internalMutation({
  args: { uploadId: v.id("manual_receipt_uploads"), token: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, input): Promise<null> => {
    const upload = await ctx.db.get(input.uploadId);
    if (!upload || upload.token !== input.token || upload.expiresAt > Date.now()) return null;
    const page = await ctx.db.system.query("_storage").withIndex("by_creation_time", q => q.gte("_creationTime", upload.createdAt).lte("_creationTime", upload.expiresAt)).paginate({ numItems: 50, cursor: input.cursor });
    for (const blob of page.page) {
      if (!blob.contentType?.endsWith(";gi-manual-upload=" + input.token)) continue;
      const attached = await ctx.db.query("manual_payments").withIndex("by_receipt_storage", q => q.eq("receiptStorageId", blob._id)).unique();
      if (!attached) await ctx.storage.delete(blob._id);
    }
    if (page.isDone) await ctx.db.delete(upload._id);
    else await ctx.scheduler.runAfter(0, internal.manualPaymentUploads.expire, { ...input, cursor: page.continueCursor });
    return null;
  },
});
`;
}
