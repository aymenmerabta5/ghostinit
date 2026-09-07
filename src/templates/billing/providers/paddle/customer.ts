/**
 * Paddle customer creation.
 */
import type { CreateCustomerInput, CreateCustomerOutput } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";
import { requirePaddleResponseString } from "./mappers.js";

export async function createPaddleCustomer(
  paddleConfig: PaddleConfig,
  input: CreateCustomerInput,
): Promise<CreateCustomerOutput> {
  if (!input.email) throw new Error("Paddle createCustomer: email required");
  const paddle = await getPaddleClient(paddleConfig);
  const actorId = input.userId?.trim();
  if (input.userId !== undefined && !actorId) {
    throw new Error("PADDLE_CUSTOMER_OWNER_INVALID: userId must not be empty");
  }

  function providerOwner(candidate: {
    customData?: Record<string, unknown> | null;
  }): string | null {
    const value = candidate.customData?.userId;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  const findExisting = async () => {
    const page = await paddle.customers.list({ email: [input.email] }).next();
    if (!actorId) return page.find((candidate) => candidate.email === input.email);

    const owned = page.find((candidate) => providerOwner(candidate) === actorId);
    if (owned) return owned;

    const emailMatch = page.find((candidate) => candidate.email === input.email);
    if (!emailMatch) return undefined;
    const conflictingOwner = providerOwner(emailMatch);
    if (conflictingOwner) {
      throw new Error(
        "PADDLE_CUSTOMER_OWNER_CONFLICT: matching email belongs to another application actor",
      );
    }
    // Email ownership can be recycled and is not a durable billing identity.
    // Legacy provider customers without canonical userId metadata require an
    // explicit migration rather than silently granting their portal to a new actor.
    throw new Error(
      "PADDLE_CUSTOMER_OWNER_UNVERIFIED: migrate the legacy provider customer with canonical userId metadata",
    );
  };
  const existing = await findExisting();
  if (existing) return { id: existing.id, providerCustomerId: existing.id };

  let customer: { id?: string };
  try {
    customer = await paddle.customers.create({
      email: input.email,
      name: input.name ?? input.email.split("@")[0],
      customData: {
        ...input.metadata,
        ...(actorId ? { userId: actorId } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    });
  } catch (createError) {
    const match = await findExisting();
    if (!match) throw createError;
    customer = match;
  }
  const id = requirePaddleResponseString(customer.id, "create customer", "customer.id");
  return { id, providerCustomerId: id };
}
