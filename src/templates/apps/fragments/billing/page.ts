import { file, type TemplateFile } from "../../../shared.js";
import type { BillingProviderName } from "../../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../../lib/constants.js";

export type RouterType = "next" | "tanstack";

export function billingPresentationContent(
  router: RouterType = "next",
  selected: readonly BillingProviderName[] = BILLING_PROVIDERS,
): string {
  const hookImport = router === "tanstack" ? "./use-billing" : "@/app/billing/hooks/use-billing.js";
  const hasPaymentLinks = router === "tanstack" && selected.includes("chargily");
  const hasSnapshotState = router === "tanstack";
  return `"use client";
import * as React from "react";
${hasSnapshotState ? 'import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";' : ""}
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { BillingEmptyState } from "./billing-empty-state";
import { BillingInvoices } from "./billing-invoices";
import { useBillingPage } from "${hookImport}";
import { useSurfaceTranslations } from "@/lib/translations";
import { supportsBillingPortal } from "./provider-options";
${hasPaymentLinks ? 'import { BillingPaymentLinkForm } from "./payment-link-form";' : ""}

function BillingContent(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, handleCheckout, handlePortal${hasSnapshotState ? ", snapshotError, refresh" : ""} } = useBillingPage();
${hasSnapshotState ? "  const [refreshPending, startRefresh] = React.useTransition();" : ""}
  const hasSubs = subscriptions.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </div>
        {!subsLoading${hasSnapshotState ? " && !snapshotError" : ""} ? <Badge variant={pastDue ? "destructive" : hasSubs ? "secondary" : "outline"}>{pastDue ? t("paymentPastDue") : hasSubs ? t("activeSubscriptions", { count: subscriptions.length }) : t("noSubscriptionsBadge")}</Badge> : null}
      </div>
      ${hasSnapshotState ? '{snapshotError ? <Alert variant="destructive" role="alert"><AlertTitle>{t("dataUnavailable")}</AlertTitle><AlertDescription><Button type="button" size="sm" variant="outline" disabled={refreshPending} aria-busy={refreshPending} onClick={() => startRefresh(async () => { await refresh(); })}>{t("refresh")}</Button></AlertDescription></Alert> : null}' : ""}
      <BillingEmptyState disabled={isCheckoutLoading} onCheckout={handleCheckout} />
      ${hasPaymentLinks ? '<BillingPaymentLinkForm provider="chargily" />' : ""}
      {subsLoading ? <div className="flex flex-col gap-3" aria-label={t("loadingSubscriptions")}><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div> : (
        <div className="grid gap-4">
          ${hasSnapshotState ? "{!snapshotError || hasSubs ? (" : ""}<Card>
            <CardHeader><CardTitle as="h2">{t("subscriptions")}</CardTitle><CardDescription>{t("configuredProviders")}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {subscriptions.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noSubscriptionsTitle")}</EmptyTitle><EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription></EmptyHeader></Empty> : subscriptions.map((subscription) => (
                <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2"><Badge variant="secondary">{subscription.provider}</Badge><span className="font-mono text-xs">{subscription.status}</span></div>
                  {supportsBillingPortal(subscription.provider) ? <Button size="sm" variant="outline" onClick={() => handlePortal(subscription.provider)}>{t("customerPortal")}</Button> : null}
                </div>
              ))}
            </CardContent>
          </Card>${hasSnapshotState ? ") : null}" : ""}
          ${hasSnapshotState ? "{!snapshotError || invoices.length > 0 ? " : ""}<BillingInvoices invoices={invoices} />${hasSnapshotState ? " : null}" : ""}
        </div>
      )}
    </div>
  );
}

export function BillingPage(): React.JSX.Element {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <BillingContent />
      </div>
    </main>
  );
}
`;
}

export function billingEmptyStateContent(
  _selected: readonly BillingProviderName[] = BILLING_PROVIDERS,
): string {
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ProviderName } from "./queries";
import { BILLING_PROVIDERS } from "./provider-options";

export function BillingEmptyState({ disabled, onCheckout }: { disabled: boolean; onCheckout: (provider: ProviderName) => void }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <Card>
      <CardHeader><CardTitle as="h2">{t("configuredProviders")}</CardTitle><CardDescription>{t("providerDescription")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {BILLING_PROVIDERS.map((provider) => <Button key={provider.id} size="sm" variant="outline" disabled={disabled} onClick={() => onCheckout(provider.id)}>{provider.label} · {t("checkout")}</Button>)}
            </div>
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
