/**
 * Paddle customer creation.
 */
import type { CreateCustomerInput, CreateCustomerOutput } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";
import { genId } from "./mappers.js";

export async function createPaddleCustomer(
  paddleConfig: PaddleConfig,
  input: CreateCustomerInput,
): Promise<CreateCustomerOutput> {
  if (!input.email) throw new Error("Paddle createCustomer: email required");
  const paddle = await getPaddleClient(paddleConfig);
  const customer = await paddle.customers.create({
    email: input.email,
    name: input.name ?? input.email.split("@")[0],
  });
  const id = (customer as { id?: string }).id ?? genId("ctm");
  return { id, providerCustomerId: id };
}
