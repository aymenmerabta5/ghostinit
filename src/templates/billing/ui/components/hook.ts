export function billingHookContent(): string {
  return `"use client";
import * as React from "react";
import { toast } from "sonner";
export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "paused" | string;
export interface Sub { id: string; provider: ProviderName; providerSubscriptionId: string; status: SubStatus; currentPeriodEnd?: string | Date | null; customerId?: string | null; metadata?: Record<string, unknown> | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; hostedUrl?: string | null; }
export interface LicenseKey { id: string; key: string; status: string; provider: ProviderName; }
export interface UsageEvent { id: string; name: string; credits?: number; externalId?: string; provider: ProviderName; createdAt?: string | Date; }
export interface UseBillingPageReturn {
  subscriptions: Sub[]; invoices: Inv[]; licenseKey: LicenseKey | null; usageEvents: UsageEvent[];
  subsLoading: boolean; isCheckoutLoading: boolean; licenseLoading: boolean; usageLoading: boolean;
  paymentLinkUrl: string | null; shareAfterMessage: string | null; pastDue: boolean; hasCustomerId: boolean;
  copyText: (v: string) => Promise<void>; handleCheckout: (provider: ProviderName) => Promise<void>; handlePortal: (provider: ProviderName) => Promise<void>;
  createPaymentLink: () => Promise<void>; createLicenseKey: () => Promise<void>; ingestUsage: () => Promise<void>;
}
export function useBillingPage(): UseBillingPageReturn {
  const [subscriptions, setSubscriptions] = React.useState<Sub[]>([]);
  const [invoices, setInvoices] = React.useState<Inv[]>([]);
  const [licenseKey, setLicenseKey] = React.useState<LicenseKey | null>(null);
  const [usageEvents, setUsageEvents] = React.useState<UsageEvent[]>([]);
  const [subsLoading, setSubsLoading] = React.useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [licenseLoading, setLicenseLoading] = React.useState(false);
  const [usageLoading, setUsageLoading] = React.useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = React.useState<string | null>(null);
  const [shareAfterMessage, setShareAfterMessage] = React.useState<string | null>(null);
  const pastDue = subscriptions.some((s) => s.status === "past_due");
  const hasCustomerId = subscriptions.length > 0 && Boolean(subscriptions[0]?.customerId);
  async function copyText(v: string) { try { await navigator.clipboard.writeText(v); toast.success("Copied to clipboard"); } catch { toast.error("Copy failed"); } }
  async function handleCheckout(provider: ProviderName) {
    setIsCheckoutLoading(true);
    try {
      const mod = await import("@/lib/orpc").catch(() => null as any);
      if (mod?.client) {
        try {
          const client = mod.client as any;
          const res = await (client.billing?.createCheckout?.({ provider, priceId: "price_demo", successUrl: window.location.origin + "/billing/success", failureUrl: window.location.origin + "/billing/cancel", }) ?? client.billing?.checkout?.({ provider, priceId: "price_demo", successUrl: window.location.origin + "/billing/success", }));
          if (res?.url) { window.location.href = res.url; return; }
        } catch {}
      }
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, priceId: "price_demo", successUrl: window.location.origin + "/billing/success", failureUrl: window.location.origin + "/billing/cancel", }), });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { url?: string; checkout_url?: string };
      const url = data.url ?? data.checkout_url;
      if (!url) throw new Error("No checkout url returned");
      window.location.href = url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Checkout failed"); } finally { setIsCheckoutLoading(false); }
  }
  async function handlePortal(provider: ProviderName) {
    try {
      const sub = subscriptions.find((s) => s.provider === provider) ?? subscriptions[0];
      if (!sub?.customerId) { toast.error("Customer not found yet"); return; }
      const r = await fetch("/api/billing/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, customerId: sub.customerId, returnUrl: window.location.origin + "/billing" }), });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { url?: string };
      if (!data.url) throw new Error("No portal url");
      window.location.href = data.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Portal failed"); }
  }
  async function createPaymentLink() {
    try {
      const r = await fetch("/api/billing/payment-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "chargily", name: "Pro plan Algeria", items: [{ price: "price_demo", quantity: 1 }], after_completion_message: "Thank you, your payment was completed.", }), });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { url?: string; paymentLink?: { url?: string }; after_completion_message?: string };
      setPaymentLinkUrl(data.url ?? data.paymentLink?.url ?? null);
      setShareAfterMessage(data.after_completion_message ?? "Thank you, your payment was completed.");
      toast.success("Payment link created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Create payment link failed"); }
  }
  async function createLicenseKey() {
    setLicenseLoading(true);
    try {
      const r = await fetch("/api/billing/license-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "polar", subscriptionId: subscriptions.find((s) => s.provider === "polar")?.id ?? "sub_demo" }), });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as LicenseKey;
      setLicenseKey(data); toast.success("License key generated");
    } catch (e) { toast.error(e instanceof Error ? e.message : "License key failed"); } finally { setLicenseLoading(false); }
  }
  async function ingestUsage() {
    setUsageLoading(true);
    try {
      const externalId = "evt_" + Date.now().toString(36);
      const r = await fetch("/api/billing/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "polar", name: "tokens_used", organizationId: "org_demo", externalCustomerId: "cus_demo", externalId, credits: Math.floor(Math.random() * 200) + 10, metadata: { model: "gpt-4o-mini" }, }), });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { id: string };
      setUsageEvents((prev) => [...prev, { id: data.id || externalId, name: "tokens_used", credits: 50, provider: "polar" }]);
      toast.success("Usage event ingested");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ingest failed"); } finally { setUsageLoading(false); }
  }
  React.useEffect(() => {
    setSubsLoading(true);
    (async () => {
      try {
        const r = await fetch("/api/billing/subscriptions");
        if (r.ok) { const data = (await r.json()) as { subscriptions?: Sub[]; invoices?: Inv[]; usageEvents?: UsageEvent[]; licenseKeys?: LicenseKey[] }; if (data.subscriptions) setSubscriptions(data.subscriptions); if (data.invoices) setInvoices(data.invoices); if (data.usageEvents) setUsageEvents(data.usageEvents); if (data.licenseKeys?.[0]) setLicenseKey(data.licenseKeys[0]); }
      } catch {} setSubsLoading(false);
    })();
  }, []);
  return { subscriptions, invoices, licenseKey, usageEvents, subsLoading, isCheckoutLoading, licenseLoading, usageLoading, paymentLinkUrl, shareAfterMessage, pastDue, hasCustomerId, copyText, handleCheckout, handlePortal, createPaymentLink, createLicenseKey, ingestUsage };
}
`;
}
