/**
 * Paddle listSubscriptions — paginated collection.
 */
import type { ListSubscriptionsInput, Subscription } from "../interface.js";
import { getPaddleClient, type PaddleConfig } from "./client.js";
import { mapSubscriptionStatus } from "./mappers.js";

export async function listPaddleSubscriptions(
  paddleConfig: PaddleConfig,
  input: ListSubscriptionsInput,
): Promise<Subscription[]> {
  const paddle = await getPaddleClient(paddleConfig);
  const query: Record<string, unknown> = {};
  if (input.customerId) query.customerId = input.customerId;
  if (input.status && input.status !== "all") {
    const arr = Array.isArray(input.status) ? input.status : [input.status];
    const normalized = arr
      .map((s): string | null => {
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
      .filter(Boolean) as string[];
    if (normalized.length === 1) query.status = normalized[0];
    else if (normalized.length > 1) query.status = normalized;
  }
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 200) : 50;
  query.perPage = limit;

  const result: Subscription[] = [];
  try {
    const collection = paddle.subscriptions.list(query as never);
    const hasAsyncIterator =
      typeof (collection as unknown as { [Symbol.asyncIterator]?: unknown })[
        Symbol.asyncIterator
      ] === "function";

    if (hasAsyncIterator) {
      let count = 0;
      for await (const raw of collection as AsyncIterable<any>) {
        const s = raw as any;
        result.push({
          id: s.id,
          provider: "paddle",
          providerSubscriptionId: s.id,
          userId: (s.customData as any)?.userId ?? (s.customData as any)?.user_id ?? "",
          status: mapSubscriptionStatus(s.status),
          currentPeriodEnd: s.currentBillingPeriod?.endsAt
            ? new Date(s.currentBillingPeriod.endsAt)
            : s.nextBilledAt
              ? new Date(s.nextBilledAt)
              : null,
          trialEnd: null,
          priceId: s.items?.[0]?.price?.id ?? null,
          productId: s.items?.[0]?.price?.productId ?? null,
          customerId: s.customerId,
          metadata: s.customData ?? null,
          createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
          updatedAt: s.updatedAt ? new Date(s.updatedAt) : undefined,
        });
        count++;
        if (count >= limit) break;
      }
    } else {
      const col = collection as unknown as { next: () => Promise<any[]>; hasMore: boolean };
      let fetched = 0;
      let safety = 0;
      while (fetched < limit && safety < 20) {
        const page = await col.next();
        if (!page || page.length === 0) break;
        for (const s of page) {
          result.push({
            id: s.id,
            provider: "paddle",
            providerSubscriptionId: s.id,
            userId: (s.customData as any)?.userId ?? (s.customData as any)?.user_id ?? "",
            status: mapSubscriptionStatus(s.status),
            currentPeriodEnd: s.currentBillingPeriod?.endsAt
              ? new Date(s.currentBillingPeriod.endsAt)
              : s.nextBilledAt
                ? new Date(s.nextBilledAt)
                : null,
            trialEnd: null,
            priceId: s.items?.[0]?.price?.id ?? null,
            productId: s.items?.[0]?.price?.productId ?? null,
            customerId: s.customerId,
            metadata: s.customData ?? null,
            createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
            updatedAt: s.updatedAt ? new Date(s.updatedAt) : undefined,
          });
          fetched++;
          if (fetched >= limit) break;
        }
        if (!col.hasMore) break;
        safety++;
      }
    }
  } catch (err) {
    throw new Error(
      `Paddle listSubscriptions failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return result;
}
