/**
 * Chargily product / price helpers — full SDK surface.
 */
import { ensureServerOnly, getChargilyClient, type ChargilyProviderConfig } from "./client.js";

export async function createChargilyProduct(
  input: {
    name: string;
    description?: string;
    images?: string[];
    metadata?: Record<string, unknown>;
  },
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  const c = getChargilyClient(config);
  return c.createProduct({
    name: input.name,
    description: input.description,
    images: input.images,
    metadata: input.metadata as Record<string, unknown> | undefined,
  });
}

export async function createChargilyPrice(
  input: {
    amount: number;
    currency?: string;
    productId: string;
    metadata?: Record<string, unknown>;
  },
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  const c = getChargilyClient(config);
  return c.createPrice({
    amount: input.amount,
    currency: (input.currency ?? "dzd").toLowerCase(),
    product_id: input.productId,
    metadata: input.metadata as Record<string, unknown> | undefined,
  });
}

export async function getChargilyProductPrices(
  productId: string,
  perPage?: number,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  const c = getChargilyClient(config);
  return c.getProductPrices(productId, perPage);
}
