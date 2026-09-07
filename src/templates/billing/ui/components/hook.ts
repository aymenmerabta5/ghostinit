export function billingHookContent(): string {
  return `"use client";
import * as React from "react";
import { toast } from "sonner";
import { createBillingCheckoutAction, createBillingPortalAction, createBillingPaymentLinkAction } from "../actions";
import { safeBillingProviderUrl } from "@/features/billing/provider-url";

export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "paused" | string;
export interface Sub { id: string; provider: ProviderName; providerSubscriptionId: string; status: SubStatus; currentPeriodEnd?: string | Date | null; customerId?: string | null; metadata?: Record<string, unknown> | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; hostedUrl?: string | null; }
export interface LicenseKey { id: string; key: string; status: string; provider: ProviderName; }
export interface UsageEvent { id: string; name: string; credits?: number; externalId?: string; provider: ProviderName; createdAt?: string | Date; }
export interface BillingInitialData { subscriptions: unknown[]; invoices: unknown[]; licenseKeys: unknown[]; usageEvents: unknown[]; canCreatePaymentLinks?: boolean; }
export interface UseBillingPageReturn {
  subscriptions: Sub[]; invoices: Inv[]; licenseKey: LicenseKey | null; usageEvents: UsageEvent[];
  subsLoading: boolean; isCheckoutLoading: boolean;
  pastDue: boolean;
  canCreatePaymentLinks: boolean; isPaymentLinkLoading: boolean;
  handlePaymentLink: (provider: ProviderName, name: string, price: string) => Promise<string>;
  copyText: (v: string) => Promise<void>; handleCheckout: (provider: ProviderName) => Promise<void>; handlePortal: (provider: ProviderName) => Promise<void>;
}

const BillingInitialDataContext = React.createContext<BillingInitialData | null>(null);
export function BillingDataProvider({ children, initialData }: { children: React.ReactNode; initialData: BillingInitialData }): React.JSX.Element {
  return React.createElement(BillingInitialDataContext.Provider, { value: initialData }, children);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function recordId(value: Record<string, unknown>): string | null {
  return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
}
function providerName(value: unknown): ProviderName | null {
  return value === "stripe" || value === "chargily" || value === "paddle" || value === "polar" ? value : null;
}
function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}
function nullableDate(value: unknown): string | Date | null | undefined {
  return value === null || typeof value === "string" || value instanceof Date ? value : undefined;
}
function toSubscription(value: unknown): Sub | null {
  if (!isRecord(value)) return null;
  const id = recordId(value); const provider = providerName(value.provider);
  if (!id || !provider || typeof value.providerSubscriptionId !== "string" || typeof value.status !== "string") return null;
  return { id, provider, providerSubscriptionId: value.providerSubscriptionId, status: value.status, currentPeriodEnd: nullableDate(value.currentPeriodEnd), customerId: nullableString(value.customerId), metadata: value.metadata === null || isRecord(value.metadata) ? value.metadata : undefined };
}
function toInvoice(value: unknown): Inv | null {
  if (!isRecord(value)) return null;
  const id = recordId(value); const provider = providerName(value.provider);
  if (!id || !provider || typeof value.amount !== "number" || typeof value.status !== "string") return null;
  return { id, provider, amount: value.amount, currency: typeof value.currency === "string" ? value.currency : undefined, status: value.status, paid: value.paid === true, hostedUrl: nullableString(value.hostedUrl ?? value.url) };
}
function toLicenseKey(value: unknown): LicenseKey | null {
  if (!isRecord(value)) return null;
  const id = recordId(value); const provider = providerName(value.provider);
  return id && provider && typeof value.key === "string" && typeof value.status === "string" ? { id, provider, key: value.key, status: value.status } : null;
}
function toUsageEvent(value: unknown): UsageEvent | null {
  if (!isRecord(value)) return null;
  const id = recordId(value); const provider = providerName(value.provider);
  if (!id || !provider || typeof value.name !== "string") return null;
  return { id, provider, name: value.name, credits: typeof value.credits === "number" ? value.credits : undefined, externalId: typeof value.externalId === "string" ? value.externalId : undefined, createdAt: typeof value.createdAt === "string" || value.createdAt instanceof Date ? value.createdAt : undefined };
}

export function useBillingPage(): UseBillingPageReturn {
  const initialData = React.useContext(BillingInitialDataContext);
  const subscriptions = (initialData?.subscriptions ?? []).flatMap((value) => { const item = toSubscription(value); return item ? [item] : []; });
  const invoices = (initialData?.invoices ?? []).flatMap((value) => { const item = toInvoice(value); return item ? [item] : []; });
  const usageEvents = (initialData?.usageEvents ?? []).flatMap((value) => { const item = toUsageEvent(value); return item ? [item] : []; });
  const licenseKey = (initialData?.licenseKeys ?? []).map(toLicenseKey).find((value): value is LicenseKey => value !== null) ?? null;
  const subsLoading = initialData === null;
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [isPaymentLinkLoading, setIsPaymentLinkLoading] = React.useState(false);
  const canCreatePaymentLinks = initialData?.canCreatePaymentLinks === true;
  const pastDue = subscriptions.some((s) => s.status === "past_due");
  async function copyText(v: string) { try { await navigator.clipboard.writeText(v); toast.success("Copied to clipboard"); } catch { toast.error("Copy failed"); } }
  async function handleCheckout(provider: ProviderName) {
    setIsCheckoutLoading(true);
    try {
      const requestKey = crypto.randomUUID();
      const result = await createBillingCheckoutAction({ provider, origin: window.location.origin, requestKey });
      if (!result.url) throw new Error("No checkout url returned");
      window.location.href = safeBillingProviderUrl(result.url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Checkout failed"); } finally { setIsCheckoutLoading(false); }
  }
  async function handlePortal(provider: ProviderName) {
    try {
      const result = await createBillingPortalAction({ provider, origin: window.location.origin });
      if (!result.url) throw new Error("No portal url");
      window.location.href = safeBillingProviderUrl(result.url);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Portal failed"); }
  }
  async function handlePaymentLink(provider: ProviderName, name: string, price: string): Promise<string> {
    setIsPaymentLinkLoading(true);
    try {
      const result = await createBillingPaymentLinkAction({ provider, name, price });
      return safeBillingProviderUrl(result.url);
    } finally { setIsPaymentLinkLoading(false); }
  }
  return { subscriptions, invoices, licenseKey, usageEvents, subsLoading, isCheckoutLoading, pastDue, copyText, handleCheckout, handlePortal, canCreatePaymentLinks, isPaymentLinkLoading, handlePaymentLink };
}
`;
}
