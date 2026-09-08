export function paddlePanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCardIcon, ExternalLinkIcon } from "../icons";
import { Spinner } from "@/components/ui/spinner";
import { useBillingPage } from "${hookImportPath}";
import { useSurfaceTranslations } from "@/lib/translations";
import { BillingInvoices } from "../billing-invoices";
export function PaddlePanel(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, handleCheckout, handlePortal } = useBillingPage();
  const paddleSubs = subscriptions.filter((s) => s.provider === "paddle");
  return (
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle as="h2">{t("paddleTitle")}</CardTitle><CardDescription className="max-w-[65ch]">{t("paddleDescription")}</CardDescription></div><Badge variant="secondary">paddle</Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("paddle")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <CreditCardIcon data-icon="inline-start" />}{t("checkout")}</Button><Button variant="outline" onClick={() => void handlePortal("paddle")}><ExternalLinkIcon data-icon="inline-start" />{t("customerPortal")}</Button></div>
        <Alert><AlertTitle>{t("merchantOfRecordTitle")}</AlertTitle><AlertDescription className="max-w-[65ch]">{t("paddleTaxDescription")}</AlertDescription></Alert>
        <BillingInvoices invoices={invoices.filter((invoice) => invoice.provider === "paddle")} />
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">{t("subscriptions")}</h3>{subsLoading ? <Skeleton className="h-10 w-full" /> : paddleSubs.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noSubscriptionsTitle")}</EmptyTitle><EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription></EmptyHeader></Empty> : <Table><TableHeader><TableRow><TableHead>{t("provider")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("periodEnd")}</TableHead></TableRow></TableHeader><TableBody>{paddleSubs.map((s) => (<TableRow key={s.id}><TableCell><Badge variant="secondary">{s.provider}</Badge></TableCell><TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell><TableCell className="text-muted-foreground">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd as string).toLocaleDateString() : "—"}</TableCell></TableRow>))}</TableBody></Table>}</div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground"><p className="max-w-[70ch]">{t("paddleFlowDescription")}</p></CardFooter>
    </Card>
  );
}
`;
}
