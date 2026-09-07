/**
 * Stripe provider barrel — composes split modules for <300 compliance.
 * Original monolith 433 lines now <200 barrel + submodules.
 *
 * Stripe Node v19.1.0 clover API
 * Stripe(SECRET, {apiVersion:'2025-09-30.clover'}) checkout.sessions.create line_items mode subscription
 *   automatic_tax success_url cancel_url expand subscription expand[]=subscription
 * billingPortal.sessions.create customer return_url flow_data subscription_update deep-link
 * webhooks.constructEvent rawBody Buffer sig secret stripe-signature Buffer.from(await req.arrayBuffer())
 *   NOT req.json() else 403 Webhook Error events checkout.session.completed invoice.paid vs payment_succeeded
 *   subscription updated/deleted customer.subscription.updated customer.subscription.deleted lifecycle broader narrower
 * subscriptions.list customer status active|all|past_due filter
 * createCheckout createCustomer createPortalSession verifyWebhook listSubscriptions rawBody Buffer signature
 * Explicit named re-exports (no export * anti-pattern).
 */

import type {
  BillingProvider,
  BillingProviderName,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  Subscription,
} from "./interface.js";
import { resolveStripeConfig, getStripeClient } from "./stripe/client.js";
import { createStripeCheckout } from "./stripe/checkout.js";
import { createStripeCustomer } from "./stripe/customer.js";
import { createStripePortalSession } from "./stripe/portal.js";
import { verifyStripeWebhook } from "./stripe/webhook.js";
import { listStripeSubscriptions } from "./stripe/subscriptions.js";

// Explicit named re-exports (no export *)
export { STRIPE_API_VERSION, resolveStripeConfig, getStripeClient } from "./stripe/client.js";
export {
  mapStripeStatusToDomain,
  mapDomainStatusToStripe,
  resolveStripeStatusFilter,
  mapStripeSubscriptionToDomain,
} from "./stripe/mappers.js";
export { createStripeCheckout } from "./stripe/checkout.js";
export { createStripeCustomer } from "./stripe/customer.js";
export { createStripePortalSession } from "./stripe/portal.js";
export { verifyStripeWebhook } from "./stripe/webhook.js";
export { listStripeSubscriptions } from "./stripe/subscriptions.js";

export function createStripeProvider(config?: Record<string, unknown>): BillingProvider {
  const resolved = resolveStripeConfig(config);
  const stripe = getStripeClient(resolved.secretKey ?? "");

  const provider: BillingProvider = {
    name: "stripe" as BillingProviderName,
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
      return createStripeCheckout(stripe, input);
    },
    createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput> {
      return createStripeCustomer(stripe, input);
    },
    createPortalSession(input: CreatePortalSessionInput): Promise<CreatePortalSessionOutput> {
      return createStripePortalSession(stripe, input);
    },
    verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput> {
      return verifyStripeWebhook(stripe, input, resolved.webhookSecret);
    },
    listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]> {
      return listStripeSubscriptions(stripe, input);
    },
  };
  return provider;
}

export const stripeProviderFactory = createStripeProvider;
export default createStripeProvider;
