/**
 * Schema barrel — split for <300 compliance.
 * Re-exports enums + all table modules via explicit named exports (no export *).
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

import { relations } from "drizzle-orm";
import { customers } from "./tables/customers.js";
import { subscriptions } from "./tables/subscriptions.js";
import { checkouts } from "./tables/checkouts.js";
import { invoices } from "./tables/invoices.js";

export const customerRelations = relations(customers, ({ many }) => ({
  subscriptions: many(subscriptions),
  checkouts: many(checkouts),
  invoices: many(invoices),
}));
