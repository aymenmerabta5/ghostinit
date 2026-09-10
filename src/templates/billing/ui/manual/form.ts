export function manualFormContent(): string {
  return `"use client";
import type * as React from "react";
import type { ManualSummary } from "./model";
import { useManualPaymentForm } from "./use-manual-payment-form";
import { ManualPaymentFormView } from "./components/payment-form";

export function ManualPaymentForm({ summary }: { summary: ManualSummary }): React.JSX.Element {
  const state = useManualPaymentForm(summary);
  return <ManualPaymentFormView state={state} />;
}
`;
}
