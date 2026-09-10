export function billingHookContent(): string {
  return `"use client";
import { normalizeBillingSnapshot, type BillingInitialData } from "./model";
import { useBillingActions } from "./use-billing-actions";
export type { ProviderName, Sub, Inv, LicenseKey, UsageEvent, BillingInitialData } from "./model";

export function useBillingPage(initialData: BillingInitialData) {
  const data = normalizeBillingSnapshot(initialData);
  const actions = useBillingActions();
  return { ...data, ...actions, subsLoading: false, canCreatePaymentLinks: initialData.canCreatePaymentLinks === true, pastDue: data.subscriptions.some((subscription) => subscription.status === "past_due") };
}
`;
}
