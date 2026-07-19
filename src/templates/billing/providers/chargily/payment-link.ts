/**
 * Chargily payment links.
 */
import { ensureServerOnly, getChargilyClient, type ChargilyProviderConfig } from "./client.js";

export async function createChargilyPaymentLink(
  input: {
    name: string;
    items: Array<{ price: string; quantity: number; adjustable_quantity?: boolean }>;
    afterCompletionMessage?: string;
    locale?: "ar" | "en" | "fr";
    passFeesToCustomer?: boolean;
    collectShippingAddress?: boolean;
    metadata?: Record<string, unknown>;
  },
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  const c = getChargilyClient(config);
  return c.createPaymentLink({
    name: input.name,
    items: input.items.map((i) => ({
      price: i.price,
      quantity: i.quantity,
      adjustable_quantity: i.adjustable_quantity,
    })),
    after_completion_message: input.afterCompletionMessage,
    locale: (input.locale as "ar" | "en" | "fr" | undefined) ?? "en",
    pass_fees_to_customer: input.passFeesToCustomer,
    collect_shipping_address: input.collectShippingAddress,
    metadata: input.metadata as Record<string, unknown> | undefined,
  });
}

export async function listChargilyPaymentLinks(
  perPage?: number,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).listPaymentLinks(perPage);
}
