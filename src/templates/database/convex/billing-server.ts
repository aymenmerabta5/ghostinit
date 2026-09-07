/** Trusted server actions that are the only public bridge to internal billing mutations. */
export function convexBillingServerContent(): string {
  return `import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const operation = v.union(
  v.literal("claimWebhookEvent"),
  v.literal("completeWebhookEvent"),
  v.literal("failWebhookEvent"),
  v.literal("claimCheckoutIntent"),
  v.literal("completeCheckoutIntent"),
  v.literal("upsertCustomer"),
  v.literal("upsertSubscription"),
  v.literal("updateSubscriptionStatus"),
  v.literal("claimProviderSubscriptionState"),
  v.literal("commitProviderSubscriptionState"),
  v.literal("cancelProviderSubscriptionState"),
  v.literal("createProviderSubscriptionState"),
  v.literal("upsertCheckout"),
  v.literal("upsertInvoice"),
  v.literal("recordUsageEvent"),
  v.literal("upsertProduct"),
  v.literal("upsertPrice"),
);

function requireTrustedServerToken(candidate: string): void {
  const expected = process.env.BETTER_AUTH_SECRET;
  if (!expected || expected.length < 32 || expected.startsWith("REPLACE_WITH")) {
    throw new ConvexError({ code: "SERVER_AUTH_NOT_CONFIGURED", message: "Trusted server authentication is not configured" });
  }
  if (candidate.length !== expected.length) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Invalid trusted server token" });
  }
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (mismatch !== 0) throw new ConvexError({ code: "FORBIDDEN", message: "Invalid trusted server token" });
}

function requireInput(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "Billing server input must be an object" });
  }
}

export const mutate = action({
  args: { serverToken: v.string(), operation, input: v.any() },
  handler: async (ctx, args): Promise<unknown> => {
    requireTrustedServerToken(args.serverToken);
    requireInput(args.input);
    const input = args.input;
    switch (args.operation) {
      case "claimWebhookEvent": {
        const leaseToken = crypto.randomUUID();
        return await ctx.runMutation(internal.billing.claimWebhookEvent, { ...input, leaseToken });
      }
      case "completeWebhookEvent": return await ctx.runMutation(internal.billing.completeWebhookEvent, input);
      case "failWebhookEvent": return await ctx.runMutation(internal.billing.failWebhookEvent, input);
      case "claimCheckoutIntent": {
        const leaseToken = crypto.randomUUID();
        return await ctx.runMutation(internal.billing.claimCheckoutIntent, { ...input, leaseToken });
      }
      case "completeCheckoutIntent": return await ctx.runMutation(internal.billing.completeCheckoutIntent, input);
      case "upsertCustomer": return await ctx.runMutation(internal.billing.upsertCustomer, input);
      case "upsertSubscription": return await ctx.runMutation(internal.billing.upsertSubscription, input);
      case "updateSubscriptionStatus": return await ctx.runMutation(internal.billing.updateSubscriptionStatus, input);
      case "claimProviderSubscriptionState": return await ctx.runMutation(internal.billing.claimProviderSubscriptionState, input);
      case "commitProviderSubscriptionState": return await ctx.runMutation(internal.billing.commitProviderSubscriptionState, input);
      case "cancelProviderSubscriptionState": return await ctx.runMutation(internal.billing.cancelProviderSubscriptionState, input);
      case "createProviderSubscriptionState": return await ctx.runMutation(internal.billing.createProviderSubscriptionState, input);
      case "upsertCheckout": return await ctx.runMutation(internal.billing.upsertCheckout, input);
      case "upsertInvoice": return await ctx.runMutation(internal.billing.upsertInvoice, input);
      case "recordUsageEvent": return await ctx.runMutation(internal.billing.recordUsageEvent, input);
      case "upsertProduct": return await ctx.runMutation(internal.billing.upsertProduct, input);
      case "upsertPrice": return await ctx.runMutation(internal.billing.upsertPrice, input);
    }
  },
});
`;
}
