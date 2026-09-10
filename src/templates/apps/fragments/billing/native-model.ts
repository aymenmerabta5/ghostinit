import type { BillingProviderName } from "../../../../lib/addons.js";
import { billingClientProviderOptions } from "./client-capabilities.js";

export function nativeBillingModelContent(providers: readonly BillingProviderName[]): string {
  return `export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface ProviderOption { id: ProviderName; label: string; checkout: true; portal: boolean; paymentLink: boolean }
export interface SubscriptionView { id: string; provider: string; status: string; currentPeriodEnd?: string }
export interface InvoiceView { id: string; provider: string; amount: number; currency?: string; status: string; paid: boolean }
export const selectedProviders: readonly ProviderOption[] = ${JSON.stringify(billingClientProviderOptions(providers))};
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function id(value: Record<string, unknown>): string | null { return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null; }
export function subscriptionView(value: unknown): SubscriptionView | null {
  if (!record(value) || typeof value.provider !== "string" || typeof value.status !== "string") return null;
  const key = id(value);
  if (!key) return null;
  return { id: key, provider: value.provider, status: value.status, ...(typeof value.currentPeriodEnd === "string" ? { currentPeriodEnd: value.currentPeriodEnd } : {}) };
}
export function invoiceView(value: unknown): InvoiceView | null {
  if (!record(value) || typeof value.provider !== "string" || typeof value.amount !== "number" || typeof value.status !== "string" || typeof value.paid !== "boolean") return null;
  const key = id(value);
  if (!key) return null;
  return { id: key, provider: value.provider, amount: value.amount, status: value.status, paid: value.paid, ...(typeof value.currency === "string" ? { currency: value.currency } : {}) };
}
`;
}
