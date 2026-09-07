import type { ProjectMode } from "../../../lib/addons.js";

export const paddleCheckoutTypesContent = `export interface PaddleCheckoutOptions {
  transactionId: string;
  successUrl: string;
  cancelUrl: string;
  environment: "sandbox" | "production";
}
export type PaddleCheckoutPageData = { state: "ready"; options: PaddleCheckoutOptions } | { state: "invalid" };
`;

export function paddleCheckoutServerContent(mode: ProjectMode): string {
  const services = mode === "monorepo" ? "@repo/services/billing" : "@/server/services/billing";
  return `import "server-only";
import { validateBillingRedirectUrl } from "${services}";
import type { PaddleCheckoutPageData } from "@/contracts/billing";

// Public payment-page setup: no account lookup, provider request, or entitlement
// write occurs here. Native users need not sign in again in the external browser.
export function resolvePaddleCheckoutPage(input: {
  transactionId?: string; successUrl?: string; cancelUrl?: string;
}): PaddleCheckoutPageData {
  if (!input.transactionId || input.transactionId.length !== 30 || !/^txn_[a-z0-9]{26}$/.test(input.transactionId) || (input.successUrl?.length ?? 0) > 4096 || (input.cancelUrl?.length ?? 0) > 4096) return { state: "invalid" };
  const origin = process.env.BETTER_AUTH_URL ?? process.env.SITE_URL;
  if (!origin) return { state: "invalid" };
  try {
    const success = validateBillingRedirectUrl(input.successUrl ?? new URL("/billing/success", origin).toString(), "Checkout return", (key) => process.env[key]);
    const cancel = validateBillingRedirectUrl(input.cancelUrl ?? new URL("/billing/cancel", origin).toString(), "Checkout cancellation", (key) => process.env[key]);
    if (!success.ok || !cancel.ok) return { state: "invalid" };
    return { state: "ready", options: {
      transactionId: input.transactionId, successUrl: success.value, cancelUrl: cancel.value,
      environment: process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox",
    } };
  } catch { return { state: "invalid" }; }
}
`;
}
