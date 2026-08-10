import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";
import { resultImportForMode } from "./shared.js";

const sharedBillingIndex = `export { createCheckoutService } from "./create-checkout.service.js";
export { listSubscriptionsService } from "./list-subscriptions.service.js";
export { createPortalSessionService } from "./create-portal-session.service.js";
export type { BillingProviderName, CheckoutRecord, BillingProviderPort, CreateCheckoutInput, CreateCheckoutDeps, CreateCheckoutOutput } from "./create-checkout.service.js";
export type { PortalSessionRecord, CreatePortalSessionInput, CreatePortalSessionDeps, CreatePortalSessionOutput } from "./create-portal-session.service.js";
`;

export function billingCreateCheckoutContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  return `${resultImport}
export type BillingProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface CheckoutRecord { id: string; provider: BillingProviderName; url: string; status: string; }
export interface BillingProviderPort { createCheckout(input: { provider: BillingProviderName; priceId: string; successUrl: string; failureUrl: string; }): Promise<CheckoutRecord>; }
export interface CreateCheckoutInput { provider: BillingProviderName; priceId: string; successUrl: string; failureUrl: string; userId?: string; }
export interface CreateCheckoutDeps { billingProvider: BillingProviderPort; }
export type CreateCheckoutOutput = Result<CheckoutRecord, Error>;
export async function createCheckoutService(input: CreateCheckoutInput, deps: CreateCheckoutDeps): Promise<CreateCheckoutOutput> {
  try { const record = await deps.billingProvider.createCheckout(input); return ok(record); } catch (e) { return err(e instanceof Error ? e : new Error(String(e))); }
}
`;
}

function portalServiceContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  return `${resultImport}
export type BillingProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface PortalSessionRecord { url: string; }
export interface PortalProviderPort { createPortalSession?(input: { customerId: string; returnUrl: string }): Promise<PortalSessionRecord>; }
export interface CreatePortalSessionInput { provider: BillingProviderName; customerId: string; returnUrl: string; }
export interface CreatePortalSessionDeps { billingProvider: PortalProviderPort; }
export type CreatePortalSessionOutput = Result<PortalSessionRecord, Error>;
export async function createPortalSessionService(input: CreatePortalSessionInput, deps: CreatePortalSessionDeps): Promise<CreatePortalSessionOutput> {
  try {
    if (!deps.billingProvider.createPortalSession) {
      return err(new Error(\`\${input.provider} does not support a customer portal\`));
    }
    const session = await deps.billingProvider.createPortalSession({
      customerId: input.customerId,
      returnUrl: input.returnUrl,
    });
    return ok(session);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
`;
}

function listSubscriptionsContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  const dbImport =
    mode === "monorepo"
      ? `import { eq, inArray } from "drizzle-orm";
import { db } from "@repo/database";
import { subscriptions, invoices, usage_events, license_keys } from "@repo/billing";`
      : `import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { subscriptions, invoices, usage_events, license_keys } from "@/server/billing/schema/billing";`;

  return `${resultImport}
${dbImport}
export interface BillingSnapshot {
  subscriptions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  usageEvents: Array<Record<string, unknown>>;
  licenseKeys: Array<Record<string, unknown>>;
}
export async function listSubscriptionsService(userId: string): Promise<Result<BillingSnapshot, Error>> {
  try {
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    const subIds = subs.map((s: { id: string }) => s.id);
    const [invs, usage, keys] = await Promise.all([
      subIds.length ? db.select().from(invoices).where(inArray(invoices.subscriptionId, subIds)) : Promise.resolve([]),
      subIds.length ? db.select().from(usage_events).where(inArray(usage_events.subscriptionId, subIds)) : Promise.resolve([]),
      subIds.length ? db.select().from(license_keys).where(inArray(license_keys.subscriptionId, subIds)) : Promise.resolve([]),
    ]);
    return ok({
      subscriptions: subs as unknown as Array<Record<string, unknown>>,
      invoices: invs as unknown as Array<Record<string, unknown>>,
      usageEvents: usage as unknown as Array<Record<string, unknown>>,
      licenseKeys: keys as unknown as Array<Record<string, unknown>>,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
`;
}

export function billingServiceFiles(mode: ProjectMode): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/services/src" : "src/server/services";
  return [
    file(`${base}/billing/index.ts`, sharedBillingIndex),
    file(`${base}/billing/create-checkout.service.ts`, billingCreateCheckoutContent(mode)),
    file(`${base}/billing/create-portal-session.service.ts`, portalServiceContent(mode)),
    file(`${base}/billing/list-subscriptions.service.ts`, listSubscriptionsContent(mode)),
  ];
}
