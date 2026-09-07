/**
 * Polar customer creation.
 */
import type { CreateCustomerInput, CreateCustomerOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import {
  PolarProviderError,
  isRecord,
  requirePolarCapability,
  requirePolarClient,
  requirePolarResponseString,
  wrapPolarFailure,
} from "./types.js";

export async function createPolarCustomer(
  config: Record<string, unknown> | undefined,
  input: CreateCustomerInput,
): Promise<CreateCustomerOutput> {
  if (!input.email) throw new Error("INVALID_INPUT: email required for Polar customer");
  const resolved = await getPolarClientAsync(config);
  const client = requirePolarClient(resolved.client, resolved.accessToken, "create customer");
  const customers = requirePolarCapability(client.customers, "create customer", "customers");
  const createCustomer = requirePolarCapability(
    customers.create,
    "create customer",
    "customers.create",
  );
  const getExternal = input.userId
    ? requirePolarCapability(customers.getExternal, "reconcile customer", "customers.getExternal")
    : undefined;

  if (!resolved.orgId) {
    throw new PolarProviderError(
      "NOT_CONFIGURED",
      "create customer",
      "POLAR_ORG_ID is required by this provider configuration",
    );
  }

  const existingCustomer = async (): Promise<CreateCustomerOutput | null> => {
    if (!getExternal || !input.userId) return null;
    try {
      const result = await getExternal.call(customers, { externalId: input.userId });
      if (!isRecord(result)) {
        throw new PolarProviderError(
          "INVALID_RESPONSE",
          "reconcile customer",
          "SDK returned a non-object response",
        );
      }
      const id = requirePolarResponseString(result.id, "reconcile customer", "id");
      return { id, providerCustomerId: id };
    } catch (error) {
      if (isRecord(error) && error.statusCode === 404) return null;
      throw error;
    }
  };

  try {
    const existing = await existingCustomer();
    if (existing) return existing;

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
      organizationId: resolved.orgId,
      externalId: input.userId ?? input.email,
      locale: "en",
      type: "individual",
    };
    if (billingAddress) payload.billingAddress = billingAddress;
    if (input.metadata) payload.metadata = input.metadata;

    let result: unknown;
    try {
      result = await createCustomer.call(customers, payload);
    } catch (createError) {
      // externalId is the provider-side uniqueness key. If a concurrent call
      // won the create race, resolve and return that canonical customer.
      const reconciled = await existingCustomer();
      if (reconciled) return reconciled;
      throw createError;
    }
    if (!isRecord(result)) {
      throw new PolarProviderError(
        "INVALID_RESPONSE",
        "create customer",
        "SDK returned a non-object response",
      );
    }
    const id = requirePolarResponseString(result.id, "create customer", "id");
    return { id, providerCustomerId: id };
  } catch (error) {
    wrapPolarFailure("create customer", error);
  }
}
