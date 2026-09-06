export function stripeInvoicesContent(hookImportPath: string): string {
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import { formatBillingInvoiceAmount } from "@/lib/billing-money";
import type { Inv } from "${hookImportPath}";

export function StripeInvoices({ invoices }: { invoices: Inv[] }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const locale = useSurfaceLocale();
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("invoices")}</h3>
      {invoices.length === 0 ? (
        <Empty><EmptyHeader><EmptyTitle>{t("noInvoices")}</EmptyTitle><EmptyDescription>{t("securityNote")}</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("amount")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("receipt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{formatBillingInvoiceAmount(invoice, locale)}</TableCell>
                  <TableCell><Badge variant={invoice.paid ? "secondary" : "outline"}>{invoice.status}</Badge></TableCell>
                  <TableCell>{invoice.hostedUrl ? <a className="text-sm underline" href={invoice.hostedUrl} target="_blank" rel="noreferrer">{t("open")}</a> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>
      )}
    </div>
  );
}
`;
}
