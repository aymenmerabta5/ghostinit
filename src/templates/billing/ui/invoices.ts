/** Account-owned invoice records remain visible independently of subscription state. */
export function billingInvoicesContent(): string {
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatBillingInvoiceAmount } from "@/lib/billing-money";
import { formatBillingInvoiceStatus } from "../status-labels";

export interface BillingInvoiceRecord { id: string; provider: string; amount: number; currency?: string; status: string; paid: boolean; }

export function BillingInvoices({ invoices }: { invoices: readonly BillingInvoiceRecord[] }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  return <Card><CardHeader><CardTitle className="text-base">{t("invoices")}</CardTitle><CardDescription>{t("invoiceDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">
    {invoices.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noInvoices")}</EmptyTitle><EmptyDescription>{t("invoiceDescription")}</EmptyDescription></EmptyHeader></Empty> : invoices.map((invoice) => <div key={invoice.id} className="flex items-center justify-between rounded-md border px-3 py-2"><span className="text-sm">{invoice.provider} — {formatBillingInvoiceAmount(invoice, locale)}</span><Badge variant={invoice.paid ? "secondary" : "outline"}>{formatBillingInvoiceStatus(invoice.status, t)}</Badge></div>)}
  </CardContent></Card>;
}
`;
}
