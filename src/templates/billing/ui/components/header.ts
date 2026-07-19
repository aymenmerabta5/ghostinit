export function billingHeaderContent(): string {
  return `"use client";
import * as React from "react";
export function BillingHeader(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="text-sm text-muted-foreground max-w-[65ch]">Manage subscriptions, checkouts, invoices, payment links, license keys, and usage metering across providers sharing same DB tables.</p>
    </div>
  );
}
`;
}
