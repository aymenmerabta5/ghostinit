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

let registryCache: BillingProviderRegistry | null = null;

function capitalizeProvider(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function loadBillingRegistry(): Promise<BillingProviderRegistry> {
  if (registryCache) return registryCache;
  const registry: BillingProviderRegistry = {};
  for (const provider of BILLING_PROVIDER_NAMES) {
    try {
      const providerModule = await import(\`./providers/\${provider}.js\`);
      const factoryKey = \`create\${capitalizeProvider(provider)}Provider\`;
      const factory = providerModule[factoryKey] as BillingProviderFactory | undefined;
      if (factory) registry[provider] = factory;
    } catch {
      // An unselected optional provider has no emitted module.
    }
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
