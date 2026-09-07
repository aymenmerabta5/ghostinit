export function stripePanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useSurfaceTranslations } from "@/lib/translations";
import { CopyIcon, CreditCardIcon, ExternalLinkIcon } from "../icons";
import { StripeInvoices } from "./stripe-invoices";
import { StripeSubscriptions } from "./stripe-subscriptions";
import { useBillingPage } from "${hookImportPath}";

export function StripePanel(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, handleCheckout, handlePortal, copyText } = useBillingPage();
  const stripeSubs = subscriptions.filter((subscription) => subscription.provider === "stripe");
  const stripeInvs = invoices.filter((invoice) => invoice.provider === "stripe");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("stripeTitle")}</CardTitle>
            <CardDescription className="max-w-[65ch]">{t("stripeDescription")}</CardDescription>
          </div>
          <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> stripe</span></Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleCheckout("stripe")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <CreditCardIcon data-icon="inline-start" />}{t("checkout")}</Button>
          <Button variant="outline" onClick={() => void handlePortal("stripe")}><ExternalLinkIcon data-icon="inline-start" />{t("customerPortal")}</Button>
          <Button variant="outline" onClick={() => void copyText(window.location.origin)}><CopyIcon data-icon="inline-start" />{t("copySuccessUrl")}</Button>
        </div>
        {pastDue ? <Alert><AlertTitle>{t("paymentPastDue")}</AlertTitle><AlertDescription className="max-w-[65ch]">{t("paymentPastDueDescription")}</AlertDescription></Alert> : null}
        <StripeSubscriptions subscriptions={stripeSubs} loading={subsLoading} />
        <Separator />
        <StripeInvoices invoices={stripeInvs} />
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground">
        <p className="max-w-[70ch]">{t("stripeFlowDescription")}</p>
      </CardFooter>
    </Card>
  );
}
`;
}
