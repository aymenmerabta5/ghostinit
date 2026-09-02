import type { BillingProviderName } from "../../../../lib/addons.js";

export interface BillingClientProviderOption {
  id: BillingProviderName;
  label: string;
  checkout: true;
  portal: boolean;
  paymentLink: boolean;
}

const BILLING_CLIENT_CAPABILITIES: Record<BillingProviderName, BillingClientProviderOption> = {
  stripe: {
    id: "stripe",
    label: "Stripe",
    checkout: true,
    portal: true,
    paymentLink: false,
  },
  chargily: {
    id: "chargily",
    label: "Chargily (EDAHABIA/CIB)",
    checkout: true,
    portal: false,
    paymentLink: true,
  },
  paddle: {
    id: "paddle",
    label: "Paddle",
    checkout: true,
    portal: true,
    paymentLink: false,
  },
  polar: {
    id: "polar",
    label: "Polar",
    checkout: true,
    portal: true,
    paymentLink: false,
  },
};

export function billingClientProviderOptions(
  selected: readonly BillingProviderName[],
): BillingClientProviderOption[] {
  return selected.map((provider) => BILLING_CLIENT_CAPABILITIES[provider]);
}
