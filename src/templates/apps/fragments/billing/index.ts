import type { TemplateFile } from "../../../shared.js";
import { billingPage, billingPageContent, type RouterType } from "./page.js";
import { file } from "../../../shared.js";

export { billingPage, billingPageContent, type RouterType };

export function billingFiles(router: RouterType = "next"): TemplateFile[] {
  const hookPath =
    router === "tanstack"
      ? "apps/web/src/routes/billing/hooks/use-billing.ts"
      : "apps/web/src/app/billing/hooks/use-billing.ts";
  const hookContent = billingHookContent();
  return [billingPage(router), file(hookPath, hookContent)];
}

function billingHookContent(): string {
  return `"use client";
import * as React from "react";
import { toast } from "sonner";
export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface Sub { id: string; provider: ProviderName; status: string; customerId?: string | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; }
export function useBillingPage() {
  const [subscriptions, setSubscriptions] = React.useState<Sub[]>([]);
  const [invoices, setInvoices] = React.useState<Inv[]>([]);
  const [subsLoading, setSubsLoading] = React.useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const pastDue = subscriptions.some((s) => s.status === "past_due");
  async function handleCheckout(provider: ProviderName) {
    setIsCheckoutLoading(true);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, priceId: "price_demo", successUrl: window.location.origin + "/billing/success", failureUrl: window.location.origin + "/billing/cancel" }) });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Checkout failed"); } finally { setIsCheckoutLoading(false); }
  }
  async function handlePortal(provider: ProviderName) {
    try {
      const sub = subscriptions.find((s) => s.provider === provider) ?? subscriptions[0];
      if (!sub?.customerId) { toast.error("No customer"); return; }
      const r = await fetch("/api/billing/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, customerId: sub.customerId, returnUrl: window.location.origin + "/billing" }) });
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Portal failed"); }
  }
  React.useEffect(() => {
    setSubsLoading(true);
    (async () => {
      try {
        const r = await fetch("/api/billing/subscriptions");
        if (r.ok) { const d = (await r.json()) as { subscriptions?: Sub[]; invoices?: Inv[] }; if (d.subscriptions) setSubscriptions(d.subscriptions); if (d.invoices) setInvoices(d.invoices); }
      } catch {} setSubsLoading(false);
    })();
  }, []);
  return { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, handleCheckout, handlePortal };
}
`;
}
