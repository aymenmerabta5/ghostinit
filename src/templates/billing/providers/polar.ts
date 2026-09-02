/**
 * Polar provider barrel — split for <300 compliance.
 */

import type {
  BillingProvider,
  BillingProviderFactory,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  CreateLicenseKeyInput,
  CreateLicenseKeyOutput,
  IngestUsageEventInput,
  IngestUsageEventOutput,
  Subscription,
} from "./interface.js";
import { createPolarCheckout } from "./polar/checkout.js";
import { createPolarCustomer } from "./polar/customer.js";
import { createPolarPortalSession } from "./polar/portal.js";
import { verifyPolarWebhook } from "./polar/webhook.js";
import { listPolarSubscriptions } from "./polar/subscriptions.js";
import { createPolarLicenseKey } from "./polar/license.js";
import { ingestPolarUsageEvent } from "./polar/usage.js";

// Explicit named re-exports (no export *)
export { PolarProviderError } from "./polar/types.js";
export type { PolarProviderErrorCode, PolarSdkConstructor } from "./polar/types.js";
export { loadPolarSdk, getPolarCtor } from "./polar/sdk-loader.js";
export { mapPolarSubscriptionStatus, polarProductIdsOrIds } from "./polar/mappers.js";
export { getPolarClient, getPolarClientAsync } from "./polar/client.js";
export { createPolarCheckout } from "./polar/checkout.js";
export { createPolarCustomer } from "./polar/customer.js";
export { createPolarPortalSession } from "./polar/portal.js";
export { verifyPolarWebhook } from "./polar/webhook.js";
export { listPolarSubscriptions, createPolarSubscription } from "./polar/subscriptions.js";
export { createPolarLicenseKey } from "./polar/license.js";
export { ingestPolarUsageEvent } from "./polar/usage.js";
export { POLAR_WEBHOOK_EVENTS } from "./polar/constants.js";
export type { PolarWebhookEventType } from "./polar/constants.js";

class PolarProviderImpl implements BillingProvider {
  readonly name = "polar" as const;
  private readonly config: Record<string, unknown> | undefined;
  constructor(config?: Record<string, unknown>) {
    this.config = config;
  }

  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
    return createPolarCheckout(this.config, input);
  }
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput> {
    return createPolarCustomer(this.config, input);
  }
  createPortalSession(input: CreatePortalSessionInput): Promise<CreatePortalSessionOutput> {
    return createPolarPortalSession(this.config, input);
  }
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput> {
    return verifyPolarWebhook(this.config, input);
  }
  listSubscriptions(input: ListSubscriptionsInput): Promise<Subscription[]> {
    return listPolarSubscriptions(this.config, input);
  }
  createLicenseKey(input: CreateLicenseKeyInput): Promise<CreateLicenseKeyOutput> {
    return createPolarLicenseKey(this.config, input);
  }
  ingestUsageEvent(input: IngestUsageEventInput): Promise<IngestUsageEventOutput> {
    return ingestPolarUsageEvent(this.config, input);
  }
}

export const createPolarProvider: BillingProviderFactory = (config): BillingProvider =>
  new PolarProviderImpl(config as Record<string, unknown> | undefined);
export const polarProviderFactory = createPolarProvider;
