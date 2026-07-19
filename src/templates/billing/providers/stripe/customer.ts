/**
 * Stripe customer creation.
 */
// @ts-ignore
import type Stripe from "stripe";
import type { CreateCustomerInput, CreateCustomerOutput } from "../interface.js";

export async function createStripeCustomer(
  stripe: Stripe,
  input: CreateCustomerInput,
): Promise<CreateCustomerOutput> {
  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    phone: input.phone,
    address: input.address
      ? {
          country: input.address.country,
          state: input.address.state,
          city: input.address.city,
          line1: input.address.address,
          postal_code: input.address.zip,
        }
      : undefined,
    metadata: {
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.metadata
        ? Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [k, String(v)]))
        : {}),
    },
  });

  return { id: customer.id, providerCustomerId: customer.id };
}
