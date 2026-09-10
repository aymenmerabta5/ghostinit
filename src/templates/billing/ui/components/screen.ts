export function billingScreenContent(hasPaymentLink: boolean): string {
  return `"use client";
import type * as React from "react";
import type { BillingInitialData } from "./model";
import { useBillingPage } from "./use-billing-page";
import { BillingTabs } from "./components/billing-tabs";
${hasPaymentLink ? 'import { BillingPaymentLinkForm } from "./payment-link-form";' : ""}

export function BillingClientScreen({ providers, initialData }: { providers: string[]; initialData: BillingInitialData }): React.JSX.Element {
  const billing = useBillingPage(initialData);
  return <BillingTabs providers={providers} billing={billing}${hasPaymentLink ? " paymentLink={<BillingPaymentLinkForm allowed={billing.canCreatePaymentLinks} />}" : ""} />;
}
`;
}
