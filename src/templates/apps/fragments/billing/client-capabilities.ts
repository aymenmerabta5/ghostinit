import type { BillingProviderName } from "../../../../lib/addons.js";
import { billingProviderSupportsClientOperation } from "../../../../domain/capabilities/billing-provider-operations.js";

export interface BillingClientProviderOption {
  id: BillingProviderName;
  label: string;
  checkout: true;
  portal: boolean;
  paymentLink: boolean;
}

const BILLING_PROVIDER_LABELS: Record<BillingProviderName, string> = {
  stripe: "Stripe",
  chargily: "Chargily (EDAHABIA/CIB)",
  paddle: "Paddle",
  polar: "Polar",
};

export function billingClientProviderOptions(
  selected: readonly BillingProviderName[],
): BillingClientProviderOption[] {
  return selected.map((provider) => ({
    id: provider,
    label: BILLING_PROVIDER_LABELS[provider],
    checkout: true,
    portal: billingProviderSupportsClientOperation(provider, "billing.portal.v1"),
    paymentLink: billingProviderSupportsClientOperation(provider, "billing.payment-link.v1"),
  }));
}
