/**
 * Webhook factories for stripe/chargily/paddle/polar flat src structure.
 * Third copy previously in single.ts god file; now delegates to billing webhooks factory
 * and TanStack webhook routes in tanstack/api.ts.
 */
export const webhookDelegationNote =
  "Webhooks delegated to billingFiles for Next and tanstack/api.ts for TanStack Start";
export { webhookHeaders } from "../fragments/webhooks.js";
