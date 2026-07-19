// @ts-nocheck - template barrel for <300 compliance, re-exports split schema
/**
 * Billing schema — barrel, original monolith now split into enums + tables/* + index.ts
 * Keep this file for backwards compat: packages/billing/src/schema/billing.ts
 * New structure lives in ./enums.ts and ./tables/*
 * Uses explicit named re-exports (no export *).
 */
export {
  billingProviderEnum,
  subscriptionStatusEnum,
  checkoutStatusEnum,
  invoiceStatusEnum,
  licenseKeyStatusEnum,
  recurringIntervalEnum,
} from "./enums.js";
export { products, prices, productRelations, priceRelations } from "./tables/products.js";
export { customers } from "./tables/customers.js";
export { subscriptions, subscriptionRelations } from "./tables/subscriptions.js";
export { checkouts, checkoutRelations } from "./tables/checkouts.js";
export { invoices, invoiceRelations } from "./tables/invoices.js";
export { license_keys, licenseKeyRelations } from "./tables/license_keys.js";
export { usage_events } from "./tables/usage_events.js";
export { webhook_events } from "./tables/webhook_events.js";
export { customerRelations } from "./index.js";
