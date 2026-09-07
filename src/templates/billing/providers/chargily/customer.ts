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
  const actorId = input.userId?.trim();
  if (input.userId !== undefined && !actorId) {
    throw new Error("CHARGILY_CUSTOMER_OWNER_INVALID: userId must not be empty");
  }

  const listed = await c.listCustomers(100);
  const providerOwner = (customer: (typeof listed.data)[number]): string | null => {
    const value = customer.metadata?.userId;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const owned = actorId
    ? listed.data.find((customer) => providerOwner(customer) === actorId)
    : undefined;
  if (owned) return { id: owned.id, providerCustomerId: owned.id };

  const emailMatch = input.email
    ? listed.data.find((customer) => customer.email === input.email)
    : undefined;
  if (actorId && emailMatch) {
    const conflictingOwner = providerOwner(emailMatch);
    if (conflictingOwner) {
      throw new Error(
        "CHARGILY_CUSTOMER_OWNER_CONFLICT: matching email belongs to another application actor",
      );
    }
    // Never infer durable billing ownership from a recyclable email address.
    // Operators must tag a legacy customer with the canonical application userId
    // before GhostInit will adopt it into an actor-owned billing mapping.
    throw new Error(
      "CHARGILY_CUSTOMER_OWNER_UNVERIFIED: migrate the legacy provider customer with canonical userId metadata",
    );
  }
  const existing = actorId ? undefined : emailMatch;
  if (existing) return { id: existing.id, providerCustomerId: existing.id };

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
      userId: actorId,
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
