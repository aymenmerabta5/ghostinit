export function manualReviewRowContent(): string {
  return `"use client";
import type * as React from "react";
import { usePaymentReview } from "./use-payment-review";
import type { ManualPayment } from "./model";
import { ManualReviewRowView } from "./components/review-row";
import { ManualReceiptPreview } from "./receipt-preview";

export function ManualReviewRow({ item }: { item: ManualPayment }): React.JSX.Element {
  const state = usePaymentReview(item.id);
  return <ManualReviewRowView item={item} state={state} receipt={<ManualReceiptPreview id={item.id} />} />;
}
`;
}
