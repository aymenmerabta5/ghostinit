import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

export function billingPresentationContent(router: RouterType = "next"): string {
  const hookImport = router === "tanstack" ? "./use-billing" : "@/app/billing/hooks/use-billing.js";
  return `"use client";
import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { BillingEmptyState } from "./billing-empty-state";
import { useBillingPage } from "${hookImport}";
import { useSurfaceTranslations } from "@/lib/translations";

function BillingContent(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, handleCheckout, handlePortal } = useBillingPage();
  const hasSubs = subscriptions.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">{t("description")}</p>
        </div>
        <Badge variant={pastDue ? "destructive" : hasSubs ? "secondary" : "outline"}>{pastDue ? t("paymentPastDue") : hasSubs ? t("activeSubscriptions", { count: subscriptions.length }) : t("noSubscriptionsBadge")}</Badge>
      </div>
      <Separator />
      {subsLoading ? <div className="flex flex-col gap-3" aria-label={t("loadingSubscriptions")}><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div> : hasSubs ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("subscriptions")}</CardTitle><CardDescription>{t("configuredProviders")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2"><Badge variant="secondary">{subscription.provider}</Badge><span className="font-mono text-xs">{subscription.status}</span></div>
                  <Button size="sm" variant="outline" onClick={() => handlePortal(subscription.provider)}>{t("customerPortal")}</Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{t("invoices")}</CardTitle><CardDescription>{t("securityNote")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {invoices.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noInvoices")}</EmptyTitle><EmptyDescription>{t("securityNote")}</EmptyDescription></EmptyHeader></Empty> : invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{invoice.provider} — {invoice.amount} {invoice.currency ?? ""}</span>
                  <Badge variant={invoice.paid ? "secondary" : "destructive"}>{invoice.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <BillingEmptyState disabled={isCheckoutLoading} onCheckout={handleCheckout} />
      )}
    </div>
  );
}

export function BillingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <BillingContent />
      </div>
    </main>
  );
}
`;
}

export function billingEmptyStateContent(): string {
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ProviderName } from "./queries";

export function BillingEmptyState({ disabled, onCheckout }: { disabled: boolean; onCheckout: (provider: ProviderName) => void }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("subscriptions")}</CardTitle><CardDescription>{t("noBillingDescription")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Empty>
          <EmptyHeader><EmptyTitle>{t("noSubscriptionsTitle")}</EmptyTitle><EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription></EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={disabled} onClick={() => onCheckout("stripe")}>{t("stripeCheckout")}</Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => onCheckout("chargily")}>{t("chargilyCheckout")}</Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => onCheckout("paddle")}>{t("providerPaddle")}</Button>
              <Button size="sm" variant="outline" disabled={disabled} onClick={() => onCheckout("polar")}>{t("providerPolar")}</Button>
            </div>
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  );
}
`;
}

const nextBillingContent = `export { BillingPage as default } from "@/features/billing/billing-page";
`;

function tanstackBillingContentInternal(_isConvex = false): string {
  return `import { createFileRoute } from '@tanstack/react-router'
import { BillingPage } from "@/features/billing/billing-page";
import { loadInitialBillingSnapshot, loadProtectedRoute, requireProtectedRoute } from "@/lib/protected-route";

export const Route = createFileRoute('/billing')({
  beforeLoad: ({ context }) => requireProtectedRoute(context.queryClient),
  loader: ({ context }) => Promise.all([
    loadProtectedRoute(context),
    loadInitialBillingSnapshot(context),
  ]),
  component: BillingPage,
})
`;
}

export function billingPageContent(router: RouterType = "next", isConvex = false): string {
  if (router === "tanstack") return tanstackBillingContentInternal(isConvex);
  return nextBillingContent;
}

export function billingPage(router: RouterType = "next", isConvex = false): TemplateFile {
  if (router === "tanstack") {
    return file("apps/web/src/routes/billing.tsx", tanstackBillingContentInternal(isConvex));
  }
  return file("apps/web/src/app/billing/page.tsx", nextBillingContent);
}
