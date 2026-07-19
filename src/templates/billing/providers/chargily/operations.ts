/**
 * Chargily misc operations: get checkout, list, items, expire, balance.
 */
import { ensureServerOnly, getChargilyClient, type ChargilyProviderConfig } from "./client.js";

export async function getChargilyBalance(
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).getBalance();
}

export async function getChargilyCheckout(
  id: string,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).getCheckout(id);
}

export async function listChargilyCheckouts(
  perPage?: number,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).listCheckouts(perPage);
}

export async function getChargilyCheckoutItems(
  id: string,
  perPage?: number,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).getCheckoutItems(id, perPage);
}

export async function expireChargilyCheckout(
  id: string,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).expireCheckout(id);
}
