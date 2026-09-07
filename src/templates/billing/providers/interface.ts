/**
 * Billing provider abstraction — barrel re-exporting split modules for <300 compliance.
 * Vendors layer behind stable port so services never import SDKs directly.
 * This file is the public entry: "./interface.js" still resolves.
 * Uses explicit named re-exports (no export *).
 */

// Types
export { BILLING_PROVIDER_NAMES } from "./interface/types.js";
export type {
  BillingProviderName,
  SubscriptionStatus,
  CheckoutStatus,
  InvoiceStatus,
  LicenseKeyStatus,
  RecurringInterval,
  CheckoutSession,
  Subscription,
  Customer,
  BillingProduct,
  BillingPrice,
  Invoice,
  LicenseKey,
  UsageEvent,
  BillingEvent,
  VerifiedEvent,
} from "./interface/types.js";

// Inputs
export type {
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  CreatePaymentLinkInput,
  CreatePaymentLinkOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  CreateLicenseKeyInput,
  CreateLicenseKeyOutput,
  IngestUsageEventInput,
  IngestUsageEventOutput,
} from "./interface/inputs.js";

// Ports
export type {
  BillingProvider,
  BillingProviderFactory,
  BillingProviderRegistry,
} from "./interface/ports.js";

// Convenience re-exports for registry consumers
export type { BillingProviderName as BillingProviderNameRe } from "./interface/types.js";
