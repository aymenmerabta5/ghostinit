export function chargilyPanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletIcon } from "../icons";
import { Spinner } from "@/components/ui/spinner";
import { useBillingPage } from "${hookImportPath}";
import { useSurfaceTranslations } from "@/lib/translations";
import { BillingPaymentLinkForm } from "../payment-link-form";
import { BillingInvoices } from "../billing-invoices";
export function ChargilyPanel(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, handleCheckout } = useBillingPage();
  const chargilySubs = subscriptions.filter((s) => s.provider === "chargily");
  return (
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle as="h2">{t("chargilyTitle")}</CardTitle><CardDescription className="max-w-[65ch]">{t("chargilyDescription")}</CardDescription></div><Badge variant="secondary">chargily</Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Alert><AlertTitle>{t("algeriaMarketTitle")}</AlertTitle><AlertDescription className="max-w-[70ch]">{t("algeriaMarketDescription")}</AlertDescription></Alert>
        <Alert><AlertTitle>{t("serverOnlyTitle")}</AlertTitle><AlertDescription className="max-w-[70ch]">{t("chargilyServerDescription")}</AlertDescription></Alert>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("chargily")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <WalletIcon data-icon="inline-start" />}{t("checkout")}</Button></div>
        <BillingPaymentLinkForm provider="chargily" />
        <BillingInvoices invoices={invoices.filter((invoice) => invoice.provider === "chargily")} />
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">{t("subscriptions")}</h3>{subsLoading ? <Skeleton className="h-10 w-full" aria-label={t("loadingSubscriptions")} /> : chargilySubs.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noSubscriptionsTitle")}</EmptyTitle><EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription></EmptyHeader></Empty> : <Table><TableHeader><TableRow><TableHead>{t("provider")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("paymentMethod")}</TableHead><TableHead>{t("checkoutUrl")}</TableHead></TableRow></TableHeader><TableBody>{chargilySubs.map((s) => (<TableRow key={s.id}><TableCell><Badge variant="secondary">{s.provider}</Badge></TableCell><TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell><TableCell className="text-xs">EDAHABIA/CIB</TableCell><TableCell className="truncate max-w-[20ch] text-muted-foreground">{t("manualRenewal")}</TableCell></TableRow>))}</TableBody></Table>}<p className="text-xs text-muted-foreground max-w-[70ch]">{t("securityNote")}</p></div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground"><p className="max-w-[70ch]">{t("chargilyFlowDescription")}</p></CardFooter>
    </Card>
  );
}
`;
}
