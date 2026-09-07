export function convexBillingIndexContent(): string {
  return `// Explicit Convex billing barrel: provider API only, no Drizzle schema exports.
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

import { BILLING_PROVIDER_NAMES } from "./providers/interface.js";
import type {
  BillingProvider,
  BillingProviderName,
  BillingProviderFactory,
  BillingProviderRegistry,
} from "./providers/interface.js";

type BillingProviderLoader = () => Promise<BillingProviderFactory>;

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
  const factory = registry[name];
  if (!factory) {
    throw new Error(
      \`BILLING_PROVIDER_NOT_REGISTERED: \${name}. Run: ghostinit add billing --provider \${name}\`,
    );
  }
  return factory(config);
}

export function createBillingProviderRegistry(
  factories: BillingProviderRegistry,
): BillingProviderRegistry {
  return factories;
}

export const ALL_BILLING_PROVIDERS = BILLING_PROVIDER_NAMES;
`;
}
