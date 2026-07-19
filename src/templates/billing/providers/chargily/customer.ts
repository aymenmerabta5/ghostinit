/**
 * Chargily customer helpers.
 */
import { ensureServerOnly, getChargilyClient, type ChargilyProviderConfig } from "./client.js";
import type { CreateCustomerInput, CreateCustomerOutput } from "../interface.js";

export async function createChargilyCustomer(
  input: CreateCustomerInput,
  config?: ChargilyProviderConfig | Record<string, unknown>,
): Promise<CreateCustomerOutput> {
  ensureServerOnly();
  if (!input.email && !input.name)
    throw new Error("Chargily createCustomer: email or name required");
  const c = getChargilyClient(config);

  const address = (() => {
    if (!input.address) return undefined;
    const country = (input.address.country ?? "DZ").toString().toUpperCase().slice(0, 2);
    const state = input.address.state ?? input.address.city ?? "Alger";
    const lineParts = [input.address.address, input.address.city, input.address.zip].filter(
      Boolean,
    );
    const line = lineParts.join(", ") || input.address.address || state;
    return { country, state, address: line } as never;
  })();

  const created = await c.createCustomer({
    name: input.name,
    email: input.email,
    phone: input.phone,
    address,
    metadata: {
      ...(input.metadata as Record<string, unknown>),
      userId: input.userId,
      provider: "chargily",
    } as Record<string, unknown>,
  });

  return { id: created.id, providerCustomerId: created.id };
}

export async function listChargilyCustomers(
  perPage?: number,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).listCustomers(perPage);
}

export async function getChargilyCustomer(
  id: string,
  config?: ChargilyProviderConfig | Record<string, unknown>,
) {
  ensureServerOnly();
  return getChargilyClient(config).getCustomer(id);
}
