import type { TemplateFile } from "../../../shared.js";
import {
  billingPage,
  billingPageContent,
  billingEmptyStateContent,
  billingPresentationContent,
  type RouterType,
} from "./page.js";
import { file } from "../../../shared.js";
import type { BillingProviderName } from "../../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../../lib/constants.js";
import { billingClientProviderOptions } from "./client-capabilities.js";
import { billingInvoicesContent } from "../../../billing/ui/invoices.js";
import { billingMoneyFile } from "../../../billing/ui/money.js";
import {
  billingPaymentLinkFormContent,
  billingProviderUrlContent,
} from "../../../billing/ui/payment-link-form.js";

export {
  billingEmptyStateContent,
  billingPage,
  billingPageContent,
  billingPresentationContent,
  type RouterType,
};

export function billingFiles(
  router: RouterType = "next",
  isConvex = false,
  selected: readonly BillingProviderName[] = BILLING_PROVIDERS,
): TemplateFile[] {
  const hookPath =
    router === "tanstack"
      ? "apps/web/src/features/billing/use-billing.ts"
      : "apps/web/src/app/billing/hooks/use-billing.ts";
  const featureBase = "apps/web/src/features/billing";
  const hookContent = billingHookContent(router);
  return [
    billingPage(router, isConvex),
    billingMoneyFile("apps/web/src"),
    file(`${featureBase}/billing-empty-state.tsx`, billingEmptyStateContent(selected)),
    file(`${featureBase}/billing-page.tsx`, billingPresentationContent(router, selected)),
    file(`${featureBase}/billing-invoices.tsx`, billingInvoicesContent()),
    file(
      `${featureBase}/provider-options.ts`,
      `import type { ProviderName } from "./queries";
export const BILLING_PROVIDERS: readonly { id: ProviderName; label: string; checkout: true; portal: boolean; paymentLink: boolean }[] = ${JSON.stringify(billingClientProviderOptions(selected))};
export function supportsBillingPortal(provider: ProviderName): boolean { return BILLING_PROVIDERS.some((option) => option.id === provider && option.portal); }
`,
    ),
    file(`${featureBase}/provider-url.ts`, billingProviderUrlContent),
    ...(router === "tanstack" && selected.includes("chargily")
      ? [
          file(
            `${featureBase}/payment-link-form.tsx`,
            billingPaymentLinkFormContent("./use-billing"),
          ),
        ]
      : []),
    file(`${featureBase}/queries.ts`, billingQueriesContent(router)),
    file(`${featureBase}/mutations.ts`, billingMutationsContent()),
    file(hookPath, hookContent),
    ...(router === "tanstack"
      ? [file(`${featureBase}/snapshot.ts`, billingSnapshotContent())]
      : []),
  ];
}

function billingSnapshotContent(): string {
  return `export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface Sub { id: string; provider: ProviderName; status: string; customerId?: string | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; }

function isProviderName(value: unknown): value is ProviderName { return value === "stripe" || value === "chargily" || value === "paddle" || value === "polar"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function recordId(value: Record<string, unknown>): string | null { return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null; }

export function normalizeBillingSnapshot(data: { subscriptions: readonly unknown[]; invoices: readonly unknown[] }): { subscriptions: Sub[]; invoices: Inv[] } {
  const subscriptions = data.subscriptions.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = recordId(entry); const provider = entry.provider; const status = entry.status;
    if (!id || !isProviderName(provider) || typeof status !== "string") return [];
    const customerId = typeof entry.customerId === "string" || entry.customerId === null ? entry.customerId : undefined;
    return [{ id, provider, status, customerId }];
  });
  const invoices = data.invoices.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = recordId(entry); const provider = entry.provider; const status = entry.status;
    if (!id || !isProviderName(provider) || typeof status !== "string" || typeof entry.amount !== "number") return [];
    const currency = typeof entry.currency === "string" ? entry.currency : undefined;
    return [{ id, provider, status, amount: entry.amount, currency, paid: entry.paid === true }];
  });
  return { subscriptions, invoices };
}
`;
}

function billingQueriesContent(router: RouterType): string {
  if (router === "next") {
    return `"use client";
import { orpcClient } from "@/lib/orpc";
export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface Sub { id: string; provider: ProviderName; status: string; customerId?: string | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; }
function isProviderName(value: unknown): value is ProviderName { return value === "stripe" || value === "chargily" || value === "paddle" || value === "polar"; }
function recordId(value: Record<string, unknown>): string | null { return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null; }
export async function fetchBillingSnapshot(): Promise<{ subscriptions: Sub[]; invoices: Inv[] }> {
  const data = await orpcClient.billing.subscriptions();
  const subscriptions = data.subscriptions.flatMap((value) => {
    const id = recordId(value); const provider = value.provider; const status = value.status;
    if (!id || !isProviderName(provider) || typeof status !== "string") return [];
    const customerId = typeof value.customerId === "string" || value.customerId === null ? value.customerId : undefined;
    return [{ id, provider, status, customerId }];
  });
  const invoices = data.invoices.flatMap((value) => {
    const id = recordId(value); const provider = value.provider; const status = value.status;
    if (!id || !isProviderName(provider) || typeof status !== "string" || typeof value.amount !== "number") return [];
    const currency = typeof value.currency === "string" ? value.currency : undefined;
    return [{ id, provider, status, amount: value.amount, currency, paid: value.paid === true }];
  });
  return { subscriptions, invoices };
}
`;
  }
  const queryImports =
    router === "tanstack"
      ? `import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingSnapshotQueryKey, currentQueryAuthScope } from "@/lib/query-client";`
      : "";
  const queryHook =
    router === "tanstack"
      ? `
export function useBillingSnapshot() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  return useQuery({
    queryKey: scope ? billingSnapshotQueryKey(scope) : ["auth", "anonymous", "billing", "snapshot"],
    queryFn: fetchBillingSnapshot,
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  });
}
`
      : "";
  return `"use client";
${queryImports}
import { protectedRouteSessionQueryOptions } from "@/lib/protected-route";
import { getProtectedRouteSession } from "@/lib/server-functions";
import { orpcClient } from "@/lib/orpc";
import { normalizeBillingSnapshot, type Inv, type Sub } from "./snapshot";
export type { Inv, ProviderName, Sub } from "./snapshot";
export async function fetchBillingSnapshot(): Promise<{ subscriptions: Sub[]; invoices: Inv[] }> {
  const data = await orpcClient.billing.subscriptions();
  return normalizeBillingSnapshot(data);
}
${queryHook}
export function useBillingIdentity() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  return useQuery({
    queryKey: scope ? protectedRouteSessionQueryOptions(scope).queryKey : ["auth", "anonymous", "billing", "identity"],
    queryFn: () => getProtectedRouteSession(),
    enabled: Boolean(scope),
    staleTime: 30_000,
  });
}
`;
}

function billingMutationsContent(): string {
  return `"use client";
import { orpcClient } from "@/lib/orpc";
import type { ProviderName } from "./queries";
export function createBillingCheckout(input: { provider: ProviderName; planId: "pro"; successUrl: string; failureUrl: string; requestKey: string }) {
  return orpcClient.billing.createCheckout(input);
}
export function createBillingPortalSession(input: { provider: ProviderName; returnUrl: string }) {
  return orpcClient.billing.createPortalSession(input);
}
export function createBillingPaymentLink(input: { provider: ProviderName; name: string; items: { price: string; quantity: number }[] }) {
  return orpcClient.billing.createPaymentLink(input);
}
`;
}

function billingHookContent(router: RouterType): string {
  if (router === "tanstack") {
    return `"use client";
import * as React from "react";
import { toast } from "sonner";
import { useBillingSnapshot, useBillingIdentity } from "./queries";
import type { ProviderName } from "./snapshot";
export type { ProviderName } from "./snapshot";
import { createBillingCheckout, createBillingPortalSession, createBillingPaymentLink } from "./mutations";
import { safeBillingProviderUrl } from "./provider-url";
import { supportsBillingPortal } from "./provider-options";

export function useBillingPage() {
  const snapshot = useBillingSnapshot();
  const identity = useBillingIdentity();
  const role = identity.data?.user?.role;
  const canCreatePaymentLinks = !identity.data?.user?.banned && (role === "admin" || role === "superAdmin");
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [isPaymentLinkLoading, setIsPaymentLinkLoading] = React.useState(false);
  const subscriptions = snapshot.data?.subscriptions ?? [];
  const invoices = snapshot.data?.invoices ?? [];
  const pastDue = subscriptions.some((subscription) => subscription.status === "past_due");
  async function handleCheckout(provider: ProviderName) {
    setIsCheckoutLoading(true);
    try {
      const result = await createBillingCheckout({ provider, planId: "pro", successUrl: window.location.origin + "/billing/success", failureUrl: window.location.origin + "/billing/cancel", requestKey: crypto.randomUUID() });
      if (!result.url) throw new Error("No checkout url returned");
      window.location.href = safeBillingProviderUrl(result.url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Checkout failed"); }
    finally { setIsCheckoutLoading(false); }
  }
  async function handlePortal(provider: ProviderName) {
    if (!supportsBillingPortal(provider)) return;
    try {
      const result = await createBillingPortalSession({ provider, returnUrl: window.location.origin + "/billing" });
      if (result.url) window.location.href = safeBillingProviderUrl(result.url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Portal failed"); }
  }
  async function handlePaymentLink(provider: ProviderName, name: string, price: string): Promise<string> {
    setIsPaymentLinkLoading(true);
    try { return safeBillingProviderUrl((await createBillingPaymentLink({ provider, name, items: [{ price, quantity: 1 }] })).url); }
    finally { setIsPaymentLinkLoading(false); }
  }
  return { subscriptions, invoices, subsLoading: snapshot.isPending, isCheckoutLoading, pastDue, handleCheckout, handlePortal, canCreatePaymentLinks, isPaymentLinkLoading, handlePaymentLink, snapshotError: snapshot.error, refresh: snapshot.refetch };
}
`;
  }
  const adapterPrefix = "@/features/billing";
  return `"use client";
import * as React from "react";
import { toast } from "sonner";
import { fetchBillingSnapshot, type Inv, type ProviderName, type Sub } from "${adapterPrefix}/queries";
import { createBillingCheckout, createBillingPortalSession } from "${adapterPrefix}/mutations";
export function useBillingPage() {
  const [subscriptions, setSubscriptions] = React.useState<Sub[]>([]);
  const [invoices, setInvoices] = React.useState<Inv[]>([]);
  const [subsLoading, setSubsLoading] = React.useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const pastDue = subscriptions.some((s) => s.status === "past_due");
  async function handleCheckout(provider: ProviderName) {
    setIsCheckoutLoading(true);
    try {
      const requestKey = crypto.randomUUID();
      const result = await createBillingCheckout({ provider, planId: "pro", successUrl: window.location.origin + "/billing/success", failureUrl: window.location.origin + "/billing/cancel", requestKey });
      if (!result.url) throw new Error("No checkout url returned");
      window.location.href = result.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Checkout failed"); } finally { setIsCheckoutLoading(false); }
  }
  async function handlePortal(provider: ProviderName) {
    try {
      const result = await createBillingPortalSession({ provider, returnUrl: window.location.origin + "/billing" });
      if (result.url) window.location.href = result.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Portal failed"); }
  }
  React.useEffect(() => {
    setSubsLoading(true);
    (async () => {
      try {
        const data = await fetchBillingSnapshot();
        setSubscriptions(data.subscriptions);
        setInvoices(data.invoices);
      } catch {} setSubsLoading(false);
    })();
  }, []);
  return { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, handleCheckout, handlePortal };
}
`;
}
