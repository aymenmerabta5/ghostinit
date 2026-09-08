import type { BillingProviderName } from "../../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../../lib/constants.js";
import { billingClientProviderOptions } from "../../fragments/billing/client-capabilities.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";
import type { DesktopMode } from "../model.js";

export function desktopRouteBillingContent(
  selectedProviders: readonly BillingProviderName[] = BILLING_PROVIDERS,
  hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  const providerOptions = JSON.stringify(billingClientProviderOptions(selectedProviders));
  const i18n = nativeI18nTemplate(hasI18n, "billing", nativeI18nImportPath("desktop", mode));
  const renews = hasI18n
    ? '{t("renews", { date: item.currentPeriodEnd })}'
    : "Renews {item.currentPeriodEnd}";
  return `import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { desktopBillingReturnUrl, desktopQueryOptions, orpc } from "../lib/orpc";
import { useAuthOwnedEffect } from "../hooks/use-auth-owned-effect";
${i18n.importLine.replace("{ useTranslations }", "{ usePlatformI18n, useTranslations }")}
import { formatBillingInvoiceAmount } from "${mode === "single" ? "@/renderer/lib/billing-money" : "@/lib/billing-money"}";

type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
type ProviderOption = { id: ProviderName; label: string; checkout: true; portal: boolean; paymentLink: boolean };
type SubscriptionView = { id: string; provider: string; status: string; currentPeriodEnd?: string };
type InvoiceView = { id: string; provider: string; amount: number; currency?: string; status: string; paid: boolean };

const SELECTED_PROVIDERS = ${providerOptions} satisfies readonly ProviderOption[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordId(value: Record<string, unknown>): string | null {
  return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
}

function subscriptionView(value: unknown): SubscriptionView | null {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.status !== "string") return null;
  const id = recordId(value);
  if (!id) return null;
  return {
    id,
    provider: value.provider,
    status: value.status,
    ...(typeof value.currentPeriodEnd === "string" ? { currentPeriodEnd: value.currentPeriodEnd } : {}),
  };
}

function invoiceView(value: unknown): InvoiceView | null {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.amount !== "number" || typeof value.status !== "string" || typeof value.paid !== "boolean") return null;
  const id = recordId(value);
  if (!id) return null;
  return {
    id,
    provider: value.provider,
    amount: value.amount,
    status: value.status,
    paid: value.paid,
    ...(typeof value.currency === "string" ? { currency: value.currency } : {}),
  };
}

async function openProviderUrl(value: string): Promise<void> {
  const parsed = new URL(value);
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password) throw new Error("Billing provider returned an unsafe URL");
  await window.desktopBridge.shellOpenExternal(parsed.toString());
}

export const Route = createFileRoute("/billing")({ component: BillingPage });

function BillingPage(): React.JSX.Element {
${i18n.hookLine}
  const captureEffect = useAuthOwnedEffect();
  const locale = ${hasI18n ? "usePlatformI18n().locale" : '"en"'};
  const identity = useQuery(desktopQueryOptions.me());
  const user = identity.data?.user;
  const isAuthenticated = Boolean(user && !user.banned);
  const snapshot = useQuery(orpc.billing.subscriptions.queryOptions({ enabled: isAuthenticated }));
  const checkout = useMutation(orpc.billing.createCheckout.mutationOptions());
  const portal = useMutation(orpc.billing.createPortalSession.mutationOptions());
  const paymentLink = useMutation(orpc.billing.createPaymentLink.mutationOptions());
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [linkName, setLinkName] = React.useState(${i18n.value("defaultLinkName", "Pro plan")});
  const [linkPrice, setLinkPrice] = React.useState("");
  const subscriptions = React.useMemo(() => snapshot.data?.subscriptions.flatMap((value) => subscriptionView(value) ?? []) ?? [], [snapshot.data]);
  const invoices = React.useMemo(() => snapshot.data?.invoices.flatMap((value) => invoiceView(value) ?? []) ?? [], [snapshot.data]);
  const role = user?.banned ? null : user?.role;
  const isAdmin = role === "admin" || role === "superAdmin";
  const busy = checkout.isPending || portal.isPending || paymentLink.isPending;

  React.useEffect(() => {
    const refresh = () => { if (isAuthenticated) void snapshot.refetch(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [isAuthenticated, snapshot.refetch]);

  async function run(action: () => Promise<{ url: string }>, fallback: string): Promise<void> {
    const isCurrent = captureEffect();
    if (!isCurrent()) return;
    setActionError(null);
    try { const result = await action(); if (isCurrent()) await openProviderUrl(result.url); }
    ${hasI18n ? "catch {" : "catch (cause) {"} if (isCurrent()) setActionError(${hasI18n ? "fallback" : "cause instanceof Error ? cause.message : fallback"}); }
  }

  function startCheckout(provider: ProviderName): void {
    void run(() => checkout.mutateAsync({ provider, planId: "pro", successUrl: desktopBillingReturnUrl("success"), failureUrl: desktopBillingReturnUrl("cancel"), requestKey: crypto.randomUUID() }), ${i18n.value("checkoutError", "Checkout failed")});
  }

  function openPortal(provider: ProviderName): void {
    void run(() => portal.mutateAsync({ provider, returnUrl: desktopBillingReturnUrl("return") }), ${i18n.value("portalError", "Portal unavailable")});
  }

  function createPaymentLink(provider: ProviderName): void {
    const price = linkPrice.trim();
    const name = linkName.trim();
    if (!price || !name) { setActionError(${i18n.value("paymentLinkRequired", "Payment-link name and price ID are required")}); return; }
    void run(() => paymentLink.mutateAsync({ provider, name, items: [{ price, quantity: 1 }], afterCompletionMessage: ${i18n.value("paymentReceived", "Payment received")} }), ${i18n.value("paymentLinkError", "Payment link failed")});
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4"><div className="flex flex-col gap-1"><h1 className="text-2xl font-semibold tracking-tight">${i18n.child("title", "Billing")}</h1><p className="max-w-[65ch] text-sm text-muted-foreground">${i18n.child("description", "Secure checkout and account billing through the typed application API.")}</p></div><Button render={<Link to="/dashboard" />} nativeButton={false} size="sm" variant="outline">${i18n.child("dashboard", "Dashboard")}</Button></div>
      {actionError ? <Alert variant="destructive"><AlertTitle>${i18n.child("checkoutError", "Checkout failed")}</AlertTitle><AlertDescription>{actionError}</AlertDescription></Alert> : null}
      {snapshot.error ? <Alert variant="destructive"><AlertTitle>${i18n.child("dataUnavailable", "Billing data is unavailable")}</AlertTitle><AlertDescription>{${hasI18n ? 't("dataUnavailable")' : 'snapshot.error instanceof Error ? snapshot.error.message : "Billing data is unavailable"'}}</AlertDescription></Alert> : null}
      {!isAuthenticated ? <Alert><AlertTitle>${i18n.child("signInRequired", "Sign in required")}</AlertTitle><AlertDescription>${i18n.child("signInDescription", "Billing data and actions are actor-owned.")}</AlertDescription></Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {SELECTED_PROVIDERS.map((provider) => <Card key={provider.id}><CardHeader><CardTitle>{provider.label}</CardTitle><CardDescription>${i18n.child("providerDescription", "Only server-selected provider capabilities are exposed.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><div className="flex flex-wrap gap-2"><Button type="button" disabled={!isAuthenticated || busy} onClick={() => startCheckout(provider.id)}>${i18n.child("startCheckout", "Start checkout")}</Button>{provider.portal ? <Button type="button" variant="outline" disabled={!isAuthenticated || busy} onClick={() => openPortal(provider.id)}>${i18n.child("openPortal", "Open portal")}</Button> : null}</div>{provider.paymentLink ? isAdmin ? <FieldGroup><Field><FieldLabel htmlFor={provider.id + "-payment-link-name"}>${i18n.child("paymentLinkName", "Payment-link name")}</FieldLabel><Input id={provider.id + "-payment-link-name"} value={linkName} onChange={(event) => setLinkName(event.target.value)} /></Field><Field><FieldLabel htmlFor={provider.id + "-payment-link-price"}>${i18n.child("providerPriceId", "Provider price ID")}</FieldLabel><Input id={provider.id + "-payment-link-price"} value={linkPrice} onChange={(event) => setLinkPrice(event.target.value)} /></Field><Button type="button" variant="outline" disabled={busy} onClick={() => createPaymentLink(provider.id)}>${i18n.child("createPaymentLink", "Create payment link")}</Button></FieldGroup> : <p className="text-xs text-muted-foreground">${i18n.child("adminPaymentLinks", "Merchant administrators can create payment links.")}</p> : null}</CardContent></Card>)}
      </div>
      <Card><CardHeader><CardTitle>${i18n.child("subscriptions", "Subscriptions")}</CardTitle><CardDescription>${i18n.child("subscriptionDescription", "Actor-scoped subscription state.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{snapshot.isPending ? <div aria-busy="true" aria-label={${i18n.value("loadingSubscriptions", "Loading subscriptions")}}><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : subscriptions.length === 0 ? snapshot.error ? null : <Empty><EmptyHeader><EmptyTitle>${i18n.child("noSubscriptionsTitle", "No subscriptions yet.")}</EmptyTitle><EmptyDescription>${i18n.child("subscriptionDescription", "Actor-scoped subscription state.")}</EmptyDescription></EmptyHeader></Empty> : subscriptions.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">{item.provider}</p>{item.currentPeriodEnd ? <p className="text-xs text-muted-foreground">${renews}</p> : null}</div><Badge variant="outline">{item.status}</Badge></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>${i18n.child("invoices", "Invoices")}</CardTitle><CardDescription>${i18n.child("invoiceDescription", "Recent actor-scoped invoices.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">{snapshot.isPending ? <div aria-busy="true" aria-label={${i18n.value("invoices", "Invoices")}}><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : invoices.length === 0 ? snapshot.error ? null : <Empty><EmptyHeader><EmptyTitle>${i18n.child("noInvoices", "No invoices yet.")}</EmptyTitle><EmptyDescription>${i18n.child("invoiceDescription", "Recent actor-scoped invoices.")}</EmptyDescription></EmptyHeader></Empty> : invoices.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{item.provider} · {formatBillingInvoiceAmount(item, locale)}</span><Badge variant="outline">{item.status}</Badge></div>)}</CardContent></Card>
      <Button type="button" variant="outline" disabled={!isAuthenticated || snapshot.isFetching} onClick={() => void snapshot.refetch()}>${i18n.child("refresh", "Refresh billing")}</Button>
    </main>
  );
}
`;
}
