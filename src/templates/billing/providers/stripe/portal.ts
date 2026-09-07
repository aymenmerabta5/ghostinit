/**
 * Stripe billing portal.
 */
import type Stripe from "stripe";
import type { CreatePortalSessionInput, CreatePortalSessionOutput } from "../interface.js";

export async function createStripePortalSession(
  stripe: Stripe,
  input: CreatePortalSessionInput,
): Promise<CreatePortalSessionOutput> {
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}
