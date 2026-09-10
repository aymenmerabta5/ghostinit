import type { BillingProviderName } from "../../../../lib/addons.js";
import { billingProviderSupportsClientOperation } from "../../../../domain/capabilities/billing-provider-operations.js";

export interface BillingClientProviderOption {
  id: Exclude<BillingProviderName, "manual">;
  label: string;
  checkout: true;
  portal: boolean;
  paymentLink: boolean;
}

const BILLING_PROVIDER_LABELS: Record<Exclude<BillingProviderName, "manual">, string> = {
  stripe: "Stripe",
  chargily: "Chargily (EDAHABIA/CIB)",
  paddle: "Paddle",
  polar: "Polar",
};

export function billingClientProviderOptions(
  selected: readonly BillingProviderName[],
): BillingClientProviderOption[] {
  return selected
    .filter((provider): provider is Exclude<BillingProviderName, "manual"> => provider !== "manual")
    .map((provider) => ({
      id: provider,
      label: BILLING_PROVIDER_LABELS[provider],
      checkout: true,
      portal: billingProviderSupportsClientOperation(provider, "billing.portal.v1"),
      paymentLink: billingProviderSupportsClientOperation(provider, "billing.payment-link.v1"),
    }));
}
