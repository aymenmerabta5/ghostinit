/**
 * Stripe billing portal.
 */
// @ts-ignore
import type Stripe from "stripe";
import type { CreatePortalSessionInput, CreatePortalSessionOutput } from "../interface.js";

export async function createStripePortalSession(
  stripe: Stripe,
  input: CreatePortalSessionInput,
): Promise<CreatePortalSessionOutput> {
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
    // vendor untyped: flow_data type open union
    flow_data: {
      type: "subscription_update",
    } as unknown as Stripe.BillingPortal.SessionCreateParams.FlowData,
  });
  return { url: session.url };
}
