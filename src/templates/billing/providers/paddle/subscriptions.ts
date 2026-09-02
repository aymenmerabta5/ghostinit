/**
 * Paddle listSubscriptions — paginated collection.
 */
import type { ListSubscriptionsInput, Subscription } from "../interface.js";
import {
  getPaddleClient,
  type PaddleConfig,
  type PaddleSubscription,
  type PaddleSubscriptionStatus,
} from "./client.js";
import { mapSubscriptionStatus } from "./mappers.js";

function extractUserId(customData: Record<string, unknown> | null | undefined): string {
  if (!customData) return "";
  const rec = customData as Record<string, unknown>;
  return (rec.userId as string | undefined) ?? (rec.user_id as string | undefined) ?? "";
}

export async function listPaddleSubscriptions(
  paddleConfig: PaddleConfig,
  input: ListSubscriptionsInput,
): Promise<Subscription[]> {
  const paddle = await getPaddleClient(paddleConfig);
  const query: {
    customerId?: string[];
    status?: PaddleSubscriptionStatus[];
    perPage?: number;
  } = {};
  if (input.customerId) query.customerId = [input.customerId];
  if (input.status && input.status !== "all") {
    const arr = Array.isArray(input.status) ? input.status : [input.status];
    const normalized = arr
      .map((s): PaddleSubscriptionStatus | null => {
        if (
          s === "active" ||
          s === "trialing" ||
          s === "past_due" ||
          s === "canceled" ||
          s === "paused"
        )
          return s;
        if (s === "on_trial") return "trialing";
        return null;
      })
      .filter((status): status is PaddleSubscriptionStatus => status !== null);
    if (normalized.length > 0) query.status = normalized;
  }
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 200) : 50;
  query.perPage = limit;

  const result: Subscription[] = [];
  try {
    const collection = paddle.subscriptions.list(query);
    let fetched = 0;
    let safety = 0;
    while (fetched < limit && safety < 20) {
      const page = await collection.next();
      if (page.length === 0) break;
      for (const subscription of page) {
        result.push(toSubscription(subscription));
        fetched++;
        if (fetched >= limit) break;
      }
      if (!collection.hasMore) break;
      safety++;
    }
  } catch (err) {
    throw new Error(
      `Paddle listSubscriptions failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return result;
}

function toSubscription(subscription: PaddleSubscription): Subscription {
  return {
    id: subscription.id,
    provider: "paddle",
    providerSubscriptionId: subscription.id,
    userId: extractUserId(subscription.customData),
    status: mapSubscriptionStatus(subscription.status),
    currentPeriodEnd: subscription.currentBillingPeriod?.endsAt
      ? new Date(subscription.currentBillingPeriod.endsAt)
      : subscription.nextBilledAt
        ? new Date(subscription.nextBilledAt)
        : null,
    trialEnd: null,
    priceId: subscription.items?.[0]?.price?.id ?? null,
    productId: subscription.items?.[0]?.price?.productId ?? null,
    customerId: subscription.customerId,
    metadata: subscription.customData ?? null,
    createdAt: subscription.createdAt ? new Date(subscription.createdAt) : undefined,
    updatedAt: subscription.updatedAt ? new Date(subscription.updatedAt) : undefined,
  };
}
