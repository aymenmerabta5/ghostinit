export { polarBenefitsContent } from "./polar-benefits.js";
export { polarSubscriptionsContent } from "./polar-subscriptions.js";

export function polarPanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { CreditCardIcon, ExternalLinkIcon } from "../icons";
import { useBillingPage } from "${hookImportPath}";
import { useSurfaceTranslations } from "@/lib/translations";
import { PolarBenefits } from "./polar-benefits";
import { PolarSubscriptions } from "./polar-subscriptions";
import { BillingInvoices } from "../billing-invoices";

export function PolarPanel(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, licenseKey, usageEvents, handleCheckout, handlePortal, copyText } = useBillingPage();
  const polarSubscriptions = subscriptions.filter((subscription) => subscription.provider === "polar");
  return (
    <Card>
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle as="h2">{t("polarTitle")}</CardTitle><CardDescription className="max-w-[65ch]">{t("polarDescription")}</CardDescription></div><Badge variant="secondary">polar</Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("polar")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <CreditCardIcon data-icon="inline-start" />}{t("checkout")}</Button><Button variant="outline" onClick={() => void handlePortal("polar")}><ExternalLinkIcon data-icon="inline-start" />{t("customerPortal")}</Button></div>
        <PolarBenefits licenseKey={licenseKey} usageEvents={usageEvents} copyText={copyText} />
        <Separator />
        <PolarSubscriptions subscriptions={polarSubscriptions} loading={subsLoading} />
        <BillingInvoices invoices={invoices.filter((invoice) => invoice.provider === "polar")} />
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground"><p className="max-w-[75ch]">{t("polarFlowDescription")}</p></CardFooter>
    </Card>
  );
}
`;
}
