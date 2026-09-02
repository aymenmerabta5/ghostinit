/**
 * Billing input DTOs — extracted for <300 compliance.
 */
import type { SubscriptionStatus } from "./types.js";
import type { BillingEvent } from "./types.js";

export interface CreateCheckoutInput {
  userId: string;
  /** Stable application request key used for provider and local idempotency. */
  requestKey?: string;
  priceId: string;
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  customerId?: string;
  customerEmail?: string;
  paymentMethod?: "edahabia" | "cib" | "card" | string;
  locale?: "en" | "ar" | "fr" | string;
  metadata?: Record<string, string | number | boolean>;
  quantity?: number;
  productId?: string;
  collectShippingAddress?: boolean;
  passFeesToCustomer?: boolean;
}

export interface CreateCheckoutOutput {
  id: string;
  url: string;
  providerCheckoutId?: string;
}

export interface CreateCustomerInput {
  email: string;
  /** Stable actor/provider key for retry-safe remote customer provisioning. */
  idempotencyKey?: string;
  name?: string;
  phone?: string;
  address?: {
    country?: string;
    state?: string;
    city?: string;
    address?: string;
    zip?: string;
  };
  metadata?: Record<string, string | number | boolean>;
  userId?: string;
}

export interface CreateCustomerOutput {
  id: string;
  providerCustomerId?: string;
}

export interface CreatePortalSessionInput {
  customerId: string;
  returnUrl: string;
}

export interface CreatePortalSessionOutput {
  url: string;
}

export interface CreatePaymentLinkInput {
  name: string;
  items: Array<{ price: string; quantity: number }>;
  afterCompletionMessage?: string;
}

export interface CreatePaymentLinkOutput {
  id: string;
  url: string;
}

export interface VerifyWebhookInput {
  rawBody: Buffer;
  signature: string;
  /** Full normalized request headers for providers such as Polar/Svix. */
  headers?: Record<string, string>;
}

export interface VerifyWebhookOutput<TPayload = unknown> {
  valid: boolean;
  event?: BillingEvent<TPayload>;
  error?: string;
}

export interface ListSubscriptionsInput {
  customerId?: string;
  userId?: string;
  status?: SubscriptionStatus | SubscriptionStatus[] | "all";
  limit?: number;
}

export interface CreateLicenseKeyInput {
  subscriptionId: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateLicenseKeyOutput {
  id: string;
  key: string;
}

export interface IngestUsageEventInput {
  /** Authenticated application actor. Provider customer/org/event ids are resolved server-side. */
  actorId: string;
  /** Durable application-owned usage row id. Replays must reuse this value. */
  usageRecordId: string;
  /** Server-derived quantity from the durable usage row, never browser input. */
  credits: number;
  metadata?: Record<string, unknown>;
}

export interface IngestUsageEventOutput {
  id: string;
}
