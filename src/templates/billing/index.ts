/**
 * Billing package barrel — monorepo packages/billing/src/index.ts
 * Single: src/server/billing/index.ts
 *
 * Exports interface + schema + factory via explicit named re-exports (no export *).
 * SSOT: BILLING_PROVIDER_NAMES from ./providers/interface.js (template) mirrors
 * BILLING_PROVIDERS from src/lib/constants.ts (CLI). Adding a 5th provider:
 *   - add folder src/templates/billing/providers/<name>/ with core files
 *     (client, checkout, customer, portal?, webhook, subscriptions, mappers?)
 *   - update BILLING_PROVIDER_NAMES in providers/interface/types.ts
 *   - register its factory export in billing-generator.ts
 *   - tests/unit/billing-barrel.test.ts validates fs matches SSOT
 * CRITICAL webhook pattern (all providers): Buffer.from(await req.arrayBuffer()) NOT req.json()
 * Idempotent via webhook_events unique(provider+providerEventId) onConflictDoNothing.
 * billing-generator.ts rewrites the typed lazy-loader map to exactly the selected
 * provider modules; every emitted specifier stays literal and extensionless.
 */

// Explicit re-exports from interface (no export *)
export { BILLING_PROVIDER_NAMES } from "./providers/interface.js";
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
  BillingProvider,
  BillingProviderFactory,
  BillingProviderRegistry,
} from "./providers/interface.js";

// Explicit re-exports from schema (no export *)
export {
  billingProviderEnum,
  subscriptionStatusEnum,
  checkoutStatusEnum,
  invoiceStatusEnum,
  licenseKeyStatusEnum,
  recurringIntervalEnum,
} from "./schema/billing.js";
export { products, prices, productRelations, priceRelations } from "./schema/billing.js";
export { customers } from "./schema/billing.js";
export { subscriptions, subscriptionRelations } from "./schema/billing.js";
export { checkouts, checkoutRelations } from "./schema/billing.js";
export { invoices, invoiceRelations } from "./schema/billing.js";
export { license_keys, licenseKeyRelations } from "./schema/billing.js";
export { usage_events } from "./schema/billing.js";
export { webhook_events } from "./schema/billing.js";
export { customerRelations } from "./schema/billing.js";

import { BILLING_PROVIDER_NAMES } from "./providers/interface.js";
import type {
  BillingProvider,
  BillingProviderName,
  BillingProviderFactory,
  BillingProviderRegistry,
} from "./providers/interface.js";

type BillingProviderLoader = () => Promise<BillingProviderFactory>;

/**
 * Default source registry. The generator rewrites this map to the exact selected
 * provider set, keeping every import literal so Turbopack can resolve its closure.
 */
const billingProviderLoaders: Partial<Record<BillingProviderName, BillingProviderLoader>> = {
  stripe: async () => (await import("./providers/stripe")).createStripeProvider,
  chargily: async () => (await import("./providers/chargily")).createChargilyProvider,
  paddle: async () => (await import("./providers/paddle")).createPaddleProvider,
  polar: async () => (await import("./providers/polar")).createPolarProvider,
};

let registryCache: BillingProviderRegistry | null = null;

export async function loadBillingRegistry(): Promise<BillingProviderRegistry> {
  if (registryCache) return registryCache;
  const registry: BillingProviderRegistry = {};
  for (const provider of BILLING_PROVIDER_NAMES) {
    const loadProvider = billingProviderLoaders[provider];
    if (loadProvider) registry[provider] = await loadProvider();
  }
  registryCache = registry;
  return registry;
}

export async function getBillingProvider(
  name: BillingProviderName,
  config?: Record<string, unknown>,
): Promise<BillingProvider> {
  const registry = await loadBillingRegistry();
  const factory = registry[name as keyof BillingProviderRegistry];
  if (!factory) {
    throw new Error(
      `BILLING_PROVIDER_NOT_REGISTERED: ${name}. Run: ghostinit add billing --provider ${name}`,
    );
  }
  return factory(config);
}

export function createBillingProviderRegistry(
  factories: BillingProviderRegistry,
): BillingProviderRegistry {
  return factories;
}

// Canonical barrel alias — SSOT is BILLING_PROVIDER_NAMES from interface/types.ts
// which mirrors BILLING_PROVIDERS in src/lib/constants.ts (validated by billing-barrel test)
export const ALL_BILLING_PROVIDERS =
  BILLING_PROVIDER_NAMES satisfies readonly BillingProviderName[];
