/**
 * Polar subscriptions — verified create + paginated list.
 * Programmatic creation is supported only for free products and requires the
 * subscriptions:write scope; paid products must use checkout.
 */
import type { ListSubscriptionsInput, Subscription } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import { mapPolarSubscriptionStatus } from "./mappers.js";
import {
  PolarProviderError,
  isRecord,
  nonEmptyString,
  requirePolarCapability,
  requirePolarClient,
  requirePolarResponseString,
  wrapPolarFailure,
} from "./types.js";

function toDate(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && typeof Reflect.get(value, Symbol.asyncIterator) === "function";
}

function recordItems(value: unknown, operation: string): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (!value.every(isRecord)) {
      throw new PolarProviderError(
        "INVALID_RESPONSE",
        operation,
        "subscription page contained a non-object item",
      );
    }
    return value;
  }
  if (!isRecord(value)) {
    throw new PolarProviderError("INVALID_RESPONSE", operation, "SDK returned a non-object page");
  }
  if (Array.isArray(value.items)) return recordItems(value.items, operation);
  if (isRecord(value.result) && Array.isArray(value.result.items)) {
    return recordItems(value.result.items, operation);
  }
  throw new PolarProviderError(
    "INVALID_RESPONSE",
    operation,
    "subscription page did not include items or result.items",
  );
}

function firstPriceId(value: Record<string, unknown>): string | undefined {
  const direct = nonEmptyString(value.productPriceId) ?? nonEmptyString(value.priceId);
  if (direct) return direct;
  if (!Array.isArray(value.prices)) return undefined;
  const firstPrice = value.prices.find(isRecord);
  return firstPrice ? nonEmptyString(firstPrice.id) : undefined;
}

function toSubscription(
  value: Record<string, unknown>,
  input: Pick<ListSubscriptionsInput, "userId">,
): Subscription {
  const operation = "list subscriptions";
  const id = requirePolarResponseString(value.id, operation, "subscription id");
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const customerId = nonEmptyString(value.customerId) ?? nonEmptyString(value.customer_id);
  const userId = input.userId ?? nonEmptyString(metadata?.userId);
  if (!userId) {
    throw new PolarProviderError(
      "INVALID_RESPONSE",
      operation,
      `subscription ${id} cannot be associated with an application user`,
    );
  }
  const rawStatus = nonEmptyString(value.status) ?? nonEmptyString(value.state);
  return {
    id,
    provider: "polar",
    providerSubscriptionId: id,
    userId,
    status: mapPolarSubscriptionStatus(rawStatus),
    currentPeriodEnd: toDate(value.currentPeriodEnd ?? value.current_period_end),
    trialEnd: toDate(value.trialEnd ?? value.trial_end),
    priceId: firstPriceId(value) ?? null,
    productId: nonEmptyString(value.productId) ?? nonEmptyString(value.product_id) ?? null,
    metadata,
    customerId,
    createdAt: toDate(value.createdAt ?? value.created_at) ?? undefined,
    updatedAt: toDate(value.modifiedAt ?? value.updatedAt ?? value.updated_at) ?? undefined,
  };
}

export async function createPolarSubscription(
  config: Record<string, unknown> | undefined,
  input: {
    productId: string;
    customerId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<Subscription> {
  if (!input.productId || !input.customerId) {
    throw new Error(
      "INVALID_INPUT: productId and customerId required — subscriptions.create needs productId + customerId",
    );
  }
  const userId = nonEmptyString(input.userId) ?? nonEmptyString(input.metadata?.userId);
  if (!userId) {
    throw new Error("INVALID_INPUT: userId is required to associate the Polar subscription");
  }
  const resolved = await getPolarClientAsync(config);
  const client = requirePolarClient(resolved.client, resolved.accessToken, "create subscription");
  const subscriptions = requirePolarCapability(
    client.subscriptions,
    "create subscription",
    "subscriptions",
  );
  const createSubscription = requirePolarCapability(
    subscriptions.create,
    "create subscription",
    "subscriptions.create",
  );
  const requestMetadata: Record<string, unknown> = { ...input.metadata, userId };

  try {
    const result = await createSubscription.call(subscriptions, {
      productId: input.productId,
      customerId: input.customerId,
      metadata: requestMetadata,
    });
    if (!isRecord(result)) {
      throw new PolarProviderError(
        "INVALID_RESPONSE",
        "create subscription",
        "SDK returned a non-object response",
      );
    }
    const id = requirePolarResponseString(result.id, "create subscription", "id");
    const metadata = isRecord(result.metadata) ? result.metadata : requestMetadata;
    return {
      id,
      provider: "polar",
      providerSubscriptionId: id,
      userId,
      status: mapPolarSubscriptionStatus(nonEmptyString(result.status)),
      currentPeriodEnd: toDate(result.currentPeriodEnd),
      trialEnd: toDate(result.trialEnd),
      priceId: firstPriceId(result) ?? null,
      productId: nonEmptyString(result.productId) ?? input.productId,
      metadata,
      customerId: nonEmptyString(result.customerId) ?? input.customerId,
      createdAt: toDate(result.createdAt) ?? undefined,
      updatedAt: toDate(result.modifiedAt) ?? undefined,
    };
  } catch (error) {
    wrapPolarFailure("create subscription", error);
  }
}

export async function listPolarSubscriptions(
  config: Record<string, unknown> | undefined,
  input: ListSubscriptionsInput,
): Promise<Subscription[]> {
  const resolved = await getPolarClientAsync(config);
  const client = requirePolarClient(resolved.client, resolved.accessToken, "list subscriptions");
  const subscriptions = requirePolarCapability(
    client.subscriptions,
    "list subscriptions",
    "subscriptions",
  );
  const listSubscriptions = requirePolarCapability(
    subscriptions.list,
    "list subscriptions",
    "subscriptions.list",
  );

  try {
    const listInput: Record<string, unknown> = {};
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    if (resolved.orgId) listInput.organizationId = resolved.orgId;
    if (input.customerId) listInput.customerId = input.customerId;
    listInput.limit = limit;

    const response = await listSubscriptions.call(subscriptions, listInput);
    const items: Record<string, unknown>[] = [];
    if (isAsyncIterable(response)) {
      for await (const page of response) {
        items.push(...recordItems(page, "list subscriptions"));
        if (items.length >= limit) break;
      }
    } else {
      items.push(...recordItems(response, "list subscriptions"));
    }

    const wantedStatuses =
      input.status && input.status !== "all"
        ? (Array.isArray(input.status) ? input.status : [input.status]).map((status) =>
            status.toLowerCase(),
          )
        : undefined;

    return items
      .slice(0, limit)
      .filter((item) => {
        if (!wantedStatuses) return true;
        const rawStatus = nonEmptyString(item.status) ?? nonEmptyString(item.state);
        return rawStatus ? wantedStatuses.includes(rawStatus.toLowerCase()) : false;
      })
      .map((item) => toSubscription(item, input));
  } catch (error) {
    wrapPolarFailure("list subscriptions", error);
  }
}
