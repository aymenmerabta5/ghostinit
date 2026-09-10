export function convexManualRetentionContent(): string {
  return `import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function assertManualPaymentDeletionAllowed(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const references = await Promise.all([
    ctx.db.query("manual_payments").withIndex("by_owner_created", q => q.eq("ownerId", userId)).first(),
    ctx.db.query("manual_payments").withIndex("by_reviewer", q => q.eq("reviewerId", userId)).first(),
    ctx.db.query("manual_credit_ledger").withIndex("by_owner", q => q.eq("ownerId", userId)).first(),
    ctx.db.query("manual_credit_ledger").withIndex("by_reviewer", q => q.eq("reviewerId", userId)).first(),
    ctx.db.query("manual_wallets").withIndex("by_owner", q => q.eq("ownerId", userId)).first(),
    ctx.db.query("manual_receipt_uploads").withIndex("by_owner_expires", q => q.eq("ownerId", userId)).first(),
  ]);
  if (references.some(Boolean)) {
    throw new ConvexError({ code: "ACCOUNT_DELETION_RESTRICTED", message: "This account is referenced by retained manual payment records and cannot be deleted" });
  }
}
`;
}
