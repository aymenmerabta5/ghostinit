export function manualReceiptContent(): string {
  return `"use client";
import type * as React from "react";
import { useReceiptPreview } from "./use-receipt-preview";
import { ManualReceiptView } from "./components/receipt-preview";

export function ManualReceiptPreview({ id }: { id: string }): React.JSX.Element {
  const state = useReceiptPreview(id);
  return <ManualReceiptView state={state} />;
}
`;
}
