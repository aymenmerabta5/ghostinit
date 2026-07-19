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
 *   - factory convention create<CapName>Provider — loop registry auto-discovers
 *   - tests/unit/billing-barrel.test.ts validates fs matches SSOT
 * CRITICAL webhook pattern (all providers): Buffer.from(await req.arrayBuffer()) NOT req.json()
 * Idempotent via webhook_events unique(provider+providerEventId) onConflictDoNothing.
 * Codegen note: shared/env/billing.ts uses billingEnvLines() loop over BILLING_PROVIDERS
 * for env placeholders — same loop pattern could generate this barrel, but test safety-net
 * is sufficient vs full codegen (dogfooding via CLI).
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

let _registry: BillingProviderRegistry | null = null;

function capitalizeProvider(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function loadBillingRegistry(): Promise<BillingProviderRegistry> {
  if (_registry) return _registry;
  const registry: BillingProviderRegistry = {};
  // Loop over SSOT — adding 5th provider only requires touching
  // BILLING_PROVIDER_NAMES + provider folder; factory auto-discovered via naming convention
  for (const provider of BILLING_PROVIDER_NAMES) {
    try {
      const mod = await import(`./providers/${provider}.js`);
      const factoryKey = `create${capitalizeProvider(provider)}Provider`;
      const factory = (mod as Record<string, unknown>)[factoryKey] as
        | BillingProviderFactory
        | undefined;
      if (factory) {
        (registry as Record<string, BillingProviderFactory>)[provider] = factory;
      }
    } catch {
      // provider not installed / missing optional file — skip
    }
  }
  _registry = registry;
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
  BILLING_PROVIDER_NAMES as unknown as readonly BillingProviderName[] satisfies readonly BillingProviderName[];
