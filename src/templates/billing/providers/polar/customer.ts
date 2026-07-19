/**
 * Polar customer creation.
 */
import type { CreateCustomerInput, CreateCustomerOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";

export async function createPolarCustomer(
  config: Record<string, unknown> | undefined,
  input: CreateCustomerInput,
): Promise<CreateCustomerOutput> {
  if (!input.email) throw new Error("INVALID_INPUT: email required for Polar customer");
  const { client, accessToken, orgId } = await getPolarClientAsync(config);

  if (!client || !accessToken) {
    const id = `po_cus_${Buffer.from(input.email).toString("hex").slice(0, 12)}_${Date.now()}`;
    return { id, providerCustomerId: id };
  }

  if (!orgId) throw new Error("POLAR_ORG_ID_REQUIRED: set POLAR_ORG_ID or pass organizationId");

  try {
    const billingAddress: Record<string, string> | undefined = input.address?.country
      ? {
          country: input.address.country,
          ...(input.address.city ? { city: input.address.city } : {}),
          ...(input.address.address ? { line1: input.address.address } : {}),
          ...(input.address.state ? { state: input.address.state } : {}),
          ...(input.address.zip ? { postalCode: input.address.zip } : {}),
        }
      : undefined;

    const payload: Record<string, unknown> = {
      email: input.email,
      name: input.name,
      organizationId: orgId,
      externalId: input.userId ?? input.email,
      locale: "en",
      type: "individual",
    };
    if (billingAddress) payload.billingAddress = billingAddress;
    if (input.metadata) payload.metadata = input.metadata;

    const result = (await client.customers.create(payload)) as { id: string };
    return { id: result.id, providerCustomerId: result.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_CREATE_CUSTOMER_FAILED: ${msg}`);
  }
}
