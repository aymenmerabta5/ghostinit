export function billingModelContent(): string {
  return `export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "paused" | string;
export interface Sub { id: string; provider: ProviderName; providerSubscriptionId: string; status: SubStatus; currentPeriodEnd?: string | Date | null; customerId?: string | null; metadata?: Record<string, unknown> | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; hostedUrl?: string | null; }
export interface LicenseKey { id: string; key: string; status: string; provider: ProviderName; }
export interface UsageEvent { id: string; name: string; credits?: number; externalId?: string; provider: ProviderName; createdAt?: string | Date; }
export interface BillingInitialData { subscriptions: unknown[]; invoices: unknown[]; licenseKeys: unknown[]; usageEvents: unknown[]; canCreatePaymentLinks?: boolean; }
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

export function normalizeBillingSnapshot(initialData: BillingInitialData | null) {
  const subscriptions = (initialData?.subscriptions ?? []).flatMap((value) => { const item = toSubscription(value); return item ? [item] : []; });
  const invoices = (initialData?.invoices ?? []).flatMap((value) => { const item = toInvoice(value); return item ? [item] : []; });
  const usageEvents = (initialData?.usageEvents ?? []).flatMap((value) => { const item = toUsageEvent(value); return item ? [item] : []; });
  const licenseKey = (initialData?.licenseKeys ?? []).map(toLicenseKey).find((value): value is LicenseKey => value !== null) ?? null;
  return { subscriptions, invoices, usageEvents, licenseKey };
}
`;
}
