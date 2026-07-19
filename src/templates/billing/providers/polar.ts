/**
 * Polar provider barrel — split for <300 compliance.
 * Original 943 lines now modular.
 *
 * Context7 polarsource/polar-js MoR 4%+40c metering license keys seats
 * Polar class Polar({accessToken}) POLAR_ACCESS_TOKEN accessToken
 * checkouts.create products[] customerName customerBillingAddress country locale customerId customerEmail metadata url checkout url
 * subscriptions.create productId customerId free scope subscriptions:write
 * webhooks.createWebhookEndpoint url format slack raw events subscription.uncanceled organizationId
 * events.ingest name organizationId externalCustomerId externalId metadata credits idempotent externalId idempotency metering AI tokens
 * SDK webhook verification validateEvent body Buffer|string headers Record<string,string> secret Standard Webhooks whsec base64 WebhookVerificationError 403
 * Next.js helper @polar-sh/nextjs Webhooks({webhookSecret onPayload}) Checkout CustomerPortal
 * license keys seats limit_activations validate seats customerSeats listSeats benefitGrants
 * Buffer.from(await req.arrayBuffer()) NOT req.json() rawBody webhook secret
 * MoR 4%+40c tax MoR metering license keys Paddle
 * Explicit named re-exports (no export * anti-pattern).
 */

import type { BillingProvider, BillingProviderFactory } from "./interface.js";
import { createPolarCheckout } from "./polar/checkout.js";
import { createPolarCustomer } from "./polar/customer.js";
import { createPolarPortalSession } from "./polar/portal.js";
import { verifyPolarWebhook } from "./polar/webhook.js";
import { listPolarSubscriptions } from "./polar/subscriptions.js";
import { createPolarLicenseKey } from "./polar/license.js";
import { ingestPolarUsageEvent } from "./polar/usage.js";

// Explicit named re-exports (no export *)
export type { PolarSdkConstructor } from "./polar/types.js";
export { loadPolarSdk, getPolarCtor } from "./polar/sdk-loader.js";
export { mapPolarSubscriptionStatus, polarProductIdsOrIds } from "./polar/mappers.js";
export { getPolarClient, getPolarClientAsync } from "./polar/client.js";
export { createPolarCheckout } from "./polar/checkout.js";
export { createPolarCustomer } from "./polar/customer.js";
export { createPolarPortalSession } from "./polar/portal.js";
export { verifyPolarWebhook } from "./polar/webhook.js";
export { listPolarSubscriptions } from "./polar/subscriptions.js";
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

  createCheckout(input: any) {
    return createPolarCheckout(this.config as any, input);
  }
  createCustomer(input: any) {
    return createPolarCustomer(this.config as any, input);
  }
  createPortalSession(input: any) {
    return createPolarPortalSession(this.config as any, input);
  }
  verifyWebhook(input: any) {
    return verifyPolarWebhook(this.config as any, input);
  }
  listSubscriptions(input: any) {
    return listPolarSubscriptions(this.config as any, input);
  }
  createLicenseKey(input: any) {
    return createPolarLicenseKey(this.config as any, input);
  }
  ingestUsageEvent(input: any) {
    return ingestPolarUsageEvent(this.config as any, input);
  }
}

export const createPolarProvider: BillingProviderFactory = (config): BillingProvider =>
  new PolarProviderImpl(config as Record<string, unknown> | undefined);
export const polarProviderFactory = createPolarProvider;
