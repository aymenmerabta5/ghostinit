/**
 * Paddle provider barrel — split for <300 compliance.
 *
 * Context7 paddlehq/paddle-node-sdk 3.8.0 MoR 5%+50c
 * Paddle API_KEY Environment sandbox production
 * transactions.create items priceId quantity customerId collectionMode automatic customData checkout?.url url
 * SDK has NO separate checkouts resource — checkouts via transactions via transactions.create
 * webhooks.unmarshal rawBodyString secret sig paddle-signature header rawBody toString
 *   Buffer.from(await req.arrayBuffer()) express.raw type application/json raw body
 * EventName TransactionCompleted SubscriptionCreated SubscriptionCanceled TransactionPaid EventName
 * subscriptions.list paginated next hasMore notifications.list perPage
 * customerPortalSessions.create customerId subscriptionIds -> url portal
 * customers.create email name customers.list
 * Environment sandbox production Environment.production Environment.sandbox
 * @paddle/paddle-node-sdk @paddle/paddle-js
 * createCheckout createCustomer createPortalSession verifyWebhook listSubscriptions
 * Explicit named re-exports (no export * anti-pattern).
 */
import type {
  BillingProvider,
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
import { resolvePaddleConfig } from "./paddle/client.js";
import { createPaddleCheckout } from "./paddle/checkout.js";
import { createPaddleCustomer } from "./paddle/customer.js";
import { createPaddlePortalSession } from "./paddle/portal.js";
import { verifyPaddleWebhook } from "./paddle/webhook.js";
import { listPaddleSubscriptions } from "./paddle/subscriptions.js";

// Explicit named re-exports (no export *)
export { resolvePaddleConfig, getPaddleClient, getEnv } from "./paddle/client.js";
export type { PaddleConfig } from "./paddle/client.js";
export {
  mapSubscriptionStatus,
  mapSubscriptionStatus as mapPaddleSubscriptionStatus,
  genId,
  genId as genPaddleId,
} from "./paddle/mappers.js";
export { createPaddleCheckout } from "./paddle/checkout.js";
export { createPaddleCustomer } from "./paddle/customer.js";
export { createPaddlePortalSession } from "./paddle/portal.js";
export { verifyPaddleWebhook } from "./paddle/webhook.js";
export { listPaddleSubscriptions } from "./paddle/subscriptions.js";

export function createPaddleProvider(config?: Record<string, unknown>): BillingProvider {
  const paddleConfig = resolvePaddleConfig(config);
  return {
    get name() {
      return "paddle" as const;
    },
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
      return createPaddleCheckout(paddleConfig, input);
    },
    createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput> {
      return createPaddleCustomer(paddleConfig, input);
    },
    createPortalSession(input: CreatePortalSessionInput): Promise<CreatePortalSessionOutput> {
      return createPaddlePortalSession(paddleConfig, input);
    },
    verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput> {
      return verifyPaddleWebhook(paddleConfig, input);
    },
    listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]> {
      return listPaddleSubscriptions(paddleConfig, input);
    },
  };
}

export const createPaddleProviderFactory = createPaddleProvider;
