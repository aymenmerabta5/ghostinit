/**
 * Polar checkout creation.
 */
import type { CreateCheckoutInput, CreateCheckoutOutput } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import { polarProductIdsOrIds } from "./mappers.js";
import {
  PolarProviderError,
  isRecord,
  nonEmptyString,
  requirePolarCapability,
  requirePolarClient,
  requirePolarResponseString,
  type PolarClient,
  wrapPolarFailure,
} from "./types.js";

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && typeof Reflect.get(value, Symbol.asyncIterator) === "function";
}

function checkoutPageItems(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value) || !isRecord(value.result) || !Array.isArray(value.result.items)) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      "reconcile checkout",
      "SDK checkout page did not include result.items",
    );
  }
  if (!value.result.items.every(isRecord)) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      "reconcile checkout",
      "SDK checkout page contained a non-object item",
    );
  }
  return value.result.items;
}

async function findExistingCheckout(
  checkouts: NonNullable<PolarClient["checkouts"]>,
  input: CreateCheckoutInput & { requestKey: string },
): Promise<CreateCheckoutOutput | null> {
  const listCheckouts = requirePolarCapability(
    checkouts.list,
    "reconcile checkout",
    "checkouts.list",
  );
  const listed = await listCheckouts.call(checkouts, {
    ...(input.customerId ? { customerId: input.customerId } : { externalCustomerId: input.userId }),
    limit: 100,
  });
  if (!isAsyncIterable(listed)) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      "reconcile checkout",
      "SDK did not return an async checkout page iterator",
    );
  }

  for await (const page of listed) {
    for (const candidate of checkoutPageItems(page)) {
      const candidateMetadata = isRecord(candidate.metadata) ? candidate.metadata : {};
      if (
        candidateMetadata.userId !== input.userId ||
        candidateMetadata.requestKey !== input.requestKey
      ) {
        continue;
      }
      const id = requirePolarResponseString(candidate.id, "reconcile checkout", "id");
      const url = requirePolarResponseString(candidate.url, "reconcile checkout", "url");
      return { id, url, providerCheckoutId: id };
    }
  }
  return null;
}

export async function createPolarCheckout(
  config: Record<string, unknown> | undefined,
  input: CreateCheckoutInput,
): Promise<CreateCheckoutOutput> {
  if (!input.userId || !input.priceId || !input.successUrl)
    throw new Error("INVALID_INPUT: userId, priceId, successUrl required for Polar checkout");

  const resolved = await getPolarClientAsync(config);
  const client = requirePolarClient(resolved.client, resolved.accessToken, "create checkout");
  const checkouts = requirePolarCapability(client.checkouts, "create checkout", "checkouts");
  const createCheckout = requirePolarCapability(
    checkouts.create,
    "create checkout",
    "checkouts.create",
  );
  const products = polarProductIdsOrIds(input);

  const locale = input.locale ?? "en";
  const customerName = nonEmptyString(input.metadata?.customerName);
  const customerEmail = input.customerEmail ?? nonEmptyString(input.metadata?.customerEmail);
  const billingCountry =
    nonEmptyString(input.metadata?.billingCountry) ??
    nonEmptyString(input.metadata?.country) ??
    "US";
  const metadata = {
    ...(input.metadata
      ? Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [k, String(v)]))
      : {}),
    // Signed webhook ownership must never depend on a provider-created customer guess.
    userId: input.userId,
    ...(input.requestKey ? { requestKey: input.requestKey } : {}),
  };

  try {
    if (input.requestKey) {
      const existing = await findExistingCheckout(checkouts, {
        ...input,
        requestKey: input.requestKey,
      });
      if (existing) return existing;
    }

    const payload: Record<string, unknown> = {
      products,
      locale,
      successUrl: input.successUrl,
      returnUrl: input.failureUrl ?? input.cancelUrl,
      customerEmail,
      metadata,
    };
    if (customerName) payload.customerName = customerName;
    payload.customerBillingAddress = { country: billingCountry || "US" };
    if (input.customerId) payload.customerId = input.customerId;
    else payload.externalCustomerId = input.userId;
    if (input.quantity && input.quantity > 1) payload.seats = input.quantity;

    const result = await createCheckout.call(checkouts, payload);
    if (!isRecord(result)) {
      throw new PolarProviderError(
        "INVALID_RESPONSE",
        "create checkout",
        "SDK returned a non-object response",
      );
    }
    const id = requirePolarResponseString(result.id, "create checkout", "id");
    const url = requirePolarResponseString(result.url, "create checkout", "url");
    return { id, url, providerCheckoutId: id };
  } catch (error) {
    wrapPolarFailure("create checkout", error);
  }
}
