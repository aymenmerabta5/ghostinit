/**
 * Billing input DTOs — extracted for <300 compliance.
 */
import type { SubscriptionStatus } from "./types.js";
import type { BillingEvent } from "./types.js";

export interface CreateCheckoutInput {
  userId: string;
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

export interface VerifyWebhookInput {
  rawBody: Buffer;
  signature: string;
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
  name: string;
  organizationId: string;
  externalCustomerId: string;
  externalId: string;
  credits?: number;
  metadata?: Record<string, unknown>;
  subscriptionId?: string;
}

export interface IngestUsageEventOutput {
  id: string;
}
