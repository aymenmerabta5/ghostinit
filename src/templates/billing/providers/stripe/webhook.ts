/**
 * Stripe webhook verification — raw Buffer required.
 */
// @ts-ignore
import type Stripe from "stripe";
import type { VerifyWebhookInput, VerifyWebhookOutput, BillingEvent } from "../interface.js";

export async function verifyStripeWebhook(
  stripe: Stripe,
  input: VerifyWebhookInput,
  webhookSecret?: string,
): Promise<VerifyWebhookOutput> {
  const sig = input.signature;
  const rawBody = input.rawBody;

  if (!sig) return { valid: false, error: "Missing stripe-signature header" };
  if (!rawBody || !(rawBody instanceof Buffer)) {
    return {
      valid: false,
      error: "rawBody must be Buffer (use Buffer.from(await req.arrayBuffer()))",
    };
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret || "");
    const billingEvent: BillingEvent = {
      id: event.id,
      provider: "stripe",
      providerEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
      processed: false,
      createdAt: new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000),
    };
    switch (event.type) {
      case "checkout.session.completed":
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        break;
      default:
        break;
    }
    return { valid: true, event: billingEvent };
  } catch {
    // Generic on purpose: this result is surfaced at an unauthenticated webhook
    // boundary, so the underlying Stripe error text must not travel back out.
    return { valid: false, error: "Webhook Error" };
  }
}
