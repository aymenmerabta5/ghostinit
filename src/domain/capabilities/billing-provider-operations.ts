import { deepFreeze } from "../project/canonical.js";
import { BILLING_PROVIDERS, type BillingProvider } from "../project/choices.js";

const commonOperations = [
  "billing.checkout.v1",
  "billing.invoices.v1",
  "billing.subscriptions.v1",
] as const;

export interface BillingProviderClientBinding {
  readonly provider: BillingProvider;
  readonly operationIds: readonly string[];
}

/** Provider-specific UI promises, separate from the shared webhook/snapshot contract. */
export const BILLING_PROVIDER_CLIENT_BINDINGS = deepFreeze([
  { provider: "stripe", operationIds: [...commonOperations, "billing.portal.v1"] },
  { provider: "chargily", operationIds: [...commonOperations, "billing.payment-link.v1"] },
  { provider: "paddle", operationIds: [...commonOperations, "billing.portal.v1"] },
  { provider: "polar", operationIds: [...commonOperations, "billing.portal.v1"] },
  {
    provider: "manual",
    operationIds: [
      "billing.balance.v1",
      "billing.manual.submit.v1",
      "billing.manual.list.v1",
      "billing.manual.receipt.v1",
      "billing.manual.review.v1",
    ],
  },
] satisfies BillingProviderClientBinding[]);

export function billingProviderSupportsClientOperation(
  provider: BillingProvider,
  operationId: string,
): boolean {
  return (
    BILLING_PROVIDER_CLIENT_BINDINGS.find(
      (binding) => binding.provider === provider,
    )?.operationIds.some((operation) => operation === operationId) ?? false
  );
}

export function billingProvidersForClientOperation(
  operationId: string,
): readonly BillingProvider[] {
  return BILLING_PROVIDERS.filter((provider) =>
    billingProviderSupportsClientOperation(provider, operationId),
  );
}
