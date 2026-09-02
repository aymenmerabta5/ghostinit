/**
 * Stripe checkout session creation.
 */
import type Stripe from "stripe";
import { createHash } from "node:crypto";
import type { CreateCheckoutInput, CreateCheckoutOutput } from "../interface.js";

export async function createStripeCheckout(
  stripe: Stripe,
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOutput> {
  const successUrl = input.successUrl;
  const cancelUrl = input.cancelUrl ?? input.failureUrl ?? successUrl;
  if (!successUrl) throw new Error("STRIPE_CHECKOUT_MISSING_SUCCESS_URL: successUrl is required");

  const quantity = input.quantity ?? 1;
  const requestMetadata = {
    ...(input.metadata
      ? Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [k, String(v)]))
      : {}),
    ...(input.requestKey ? { requestKey: input.requestKey } : {}),
  };

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    automatic_tax: { enabled: true },
    expand: ["subscription"],
    ...(input.customerId ? { customer: input.customerId } : {}),
    ...(!input.customerId && input.customerEmail ? { customer_email: input.customerEmail } : {}),
    ...(Object.keys(requestMetadata).length > 0
      ? {
          metadata: requestMetadata,
          subscription_data: {
            metadata: requestMetadata,
          },
        }
      : {}),
    ...(input.customerId || input.customerEmail
      ? {}
      : input.userId
        ? { client_reference_id: input.userId }
        : {}),
  };

  if (input.userId && !sessionParams.client_reference_id) {
    sessionParams.client_reference_id = input.userId;
  }
  if (input.userId && sessionParams.subscription_data) {
    sessionParams.subscription_data.metadata = {
      ...sessionParams.subscription_data.metadata,
      userId: input.userId,
      ...(input.productId ? { productId: input.productId } : {}),
    };
  } else if (input.userId) {
    sessionParams.subscription_data = {
      metadata: {
        userId: input.userId,
        ...(input.productId ? { productId: input.productId } : {}),
        ...(input.metadata
          ? Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [k, String(v)]))
          : {}),
      },
    };
  }

  const requestOptions: Stripe.RequestOptions | undefined = input.requestKey
    ? {
        idempotencyKey: `ghostinit_checkout_${createHash("sha256").update(`${input.userId}\0${input.requestKey}`).digest("hex")}`,
      }
    : undefined;
  const session = await stripe.checkout.sessions.create(sessionParams, requestOptions);
  if (!session.url) throw new Error("STRIPE_CHECKOUT_NO_URL: checkout session url missing");

  return { id: session.id, url: session.url, providerCheckoutId: session.id };
}
