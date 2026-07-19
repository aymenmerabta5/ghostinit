/**
 * Shared webhook logic between Next and TanStack flat src structure.
 * Delegates to billing webhooks factory; original third copy in single.ts
 * now split for 10/10 architecture.
 */
export const webhookHeaders = {
  stripe: "stripe-signature",
  chargily: "signature",
  paddle: "paddle-signature",
  polar: "polar-webhook",
};

export function idempotentKey(provider: string, eventId: string): string {
  return `${provider}:${eventId}`;
}
