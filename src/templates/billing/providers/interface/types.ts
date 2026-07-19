/**
 * Billing domain types — extracted from interface.ts for <300 line compliance.
 * Providers: stripe | chargily | paddle | polar.
 */

export const BILLING_PROVIDER_NAMES = ["stripe", "chargily", "paddle", "polar"] as const;
export type BillingProviderName = (typeof BILLING_PROVIDER_NAMES)[number];

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "expired"
  | "on_trial"
  | "trial_ended";

export type CheckoutStatus = "pending" | "paid" | "completed" | "failed" | "open" | "expired";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
export type LicenseKeyStatus = "active" | "revoked" | "expired";
export type RecurringInterval = "month" | "year" | "week" | "day" | "one_time" | null;

export interface CheckoutSession {
  id: string;
  url: string;
  provider: BillingProviderName;
  providerCheckoutId?: string;
  status: CheckoutStatus;
  amount?: number;
  currency?: string;
  priceId?: string;
  customerId?: string;
  metadata?: Record<string, unknown> | null;
}

export interface Subscription {
  id: string;
  provider: BillingProviderName;
  providerSubscriptionId: string;
  userId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date | null;
  trialEnd?: Date | null;
  priceId?: string | null;
  productId?: string | null;
  metadata?: Record<string, unknown> | null;
  customerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Customer {
  id: string;
  provider: BillingProviderName;
  providerCustomerId: string;
  userId: string;
  email?: string;
  name?: string | null;
  createdAt?: Date;
}

export interface BillingProduct {
  id: string;
  provider: BillingProviderName;
  providerProductId: string;
  name: string;
  description?: string | null;
  createdAt?: Date;
}

export interface BillingPrice {
  id: string;
  provider: BillingProviderName;
  providerPriceId: string;
  productId?: string | null;
  amount: number;
  currency: string;
  recurring?: RecurringInterval;
  createdAt?: Date;
}

export interface Invoice {
  id: string;
  provider: BillingProviderName;
  providerInvoiceId: string;
  subscriptionId?: string | null;
  customerId?: string | null;
  paid: boolean;
  amount: number;
  tax?: number | null;
  currency?: string;
  status: InvoiceStatus;
  hostedUrl?: string | null;
  createdAt?: Date;
}

export interface LicenseKey {
  id: string;
  subscriptionId?: string | null;
  key: string;
  status: LicenseKeyStatus;
  provider: BillingProviderName;
  createdAt?: Date;
}

export interface UsageEvent {
  id: string;
  subscriptionId?: string | null;
  name: string;
  credits?: number;
  externalCustomerId?: string;
  organizationId?: string;
  externalId?: string;
  provider: BillingProviderName;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

export interface BillingEvent<TPayload = unknown> {
  id: string;
  provider: BillingProviderName;
  providerEventId: string;
  type: string;
  payload: TPayload;
  processed?: boolean;
  createdAt?: Date;
}

export interface VerifiedEvent<TPayload = unknown> {
  valid: boolean;
  event?: BillingEvent<TPayload>;
  error?: string;
}
