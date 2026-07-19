import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";
import { resultImportForMode } from "./shared.js";

const sharedBillingIndex = `export { createCheckoutService } from "./create-checkout.service.js";
export type { BillingProviderName, CheckoutRecord, BillingProviderPort, CreateCheckoutInput, CreateCheckoutDeps, CreateCheckoutOutput } from "./create-checkout.service.js";
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

export function billingServiceFiles(mode: ProjectMode): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/services/src" : "src/server/services";
  return [
    file(`${base}/billing/index.ts`, sharedBillingIndex),
    file(`${base}/billing/create-checkout.service.ts`, billingCreateCheckoutContent(mode)),
  ];
}
