/**
 * Polar listSubscriptions — handles async iterable + array forms.
 */
import type { ListSubscriptionsInput, Subscription } from "../interface.js";
import { getPolarClientAsync } from "./client.js";
import { mapPolarSubscriptionStatus } from "./mappers.js";

export async function listPolarSubscriptions(
  config: Record<string, unknown> | undefined,
  input: ListSubscriptionsInput,
): Promise<Subscription[]> {
  const { client, accessToken, orgId } = await getPolarClientAsync(config);
  if (!client || !accessToken) return [];

  try {
    const listInput: Record<string, unknown> = {};
    if (orgId) listInput.organizationId = orgId;
    if (input.customerId) listInput.customerId = input.customerId;
    if (input.limit) listInput.limit = input.limit;

    const maybeList = (
      client.subscriptions as {
        list?: (i: Record<string, unknown>) => Promise<unknown> | AsyncIterable<unknown>;
      }
    ).list;
    if (!maybeList) return [];

    const result = await (
      maybeList as (i: Record<string, unknown>) => Promise<unknown> | AsyncIterable<unknown>
    )(listInput);
    const items: Record<string, unknown>[] = [];

    if (result && typeof (result as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
      for await (const page of result as AsyncIterable<
        { items?: Record<string, unknown>[] } | Record<string, unknown>[]
      >) {
        if (Array.isArray(page)) items.push(...(page as Record<string, unknown>[]));
        else if (
          (page as { items?: unknown }).items &&
          Array.isArray((page as { items: unknown[] }).items)
        ) {
          items.push(
            ...((page as { items: Record<string, unknown>[] }).items as Record<string, unknown>[]),
          );
        } else items.push(page as Record<string, unknown>);
      }
    } else if (Array.isArray(result)) {
      items.push(...(result as Record<string, unknown>[]));
    } else if (
      (result as { items?: unknown }).items &&
      Array.isArray((result as { items: unknown[] }).items)
    ) {
      items.push(
        ...((result as { items: Record<string, unknown>[] }).items as Record<string, unknown>[]),
      );
    } else if ((result as { result?: { items?: unknown[] } }).result) {
      const inner = (result as { result: { items: unknown[] } }).result;
      if (Array.isArray(inner.items)) items.push(...(inner.items as Record<string, unknown>[]));
    }

    let filtered = items;
    if (input.status && input.status !== "all") {
      const wanted = Array.isArray(input.status) ? input.status : [input.status];
      const wantedNorm = wanted.map((s) => String(s).toLowerCase());
      filtered = items.filter((it) => {
        const st = String((it.status as string) ?? (it.state as string) ?? "").toLowerCase();
        return wantedNorm.includes(st);
      });
    }

    return filtered.map((it) => {
      const id = String((it.id as string) ?? `sub_${Date.now()}`);
      const customerId = (it.customerId as string) ?? (it.customer_id as string) ?? undefined;
      const productId = (it.productId as string) ?? (it.product_id as string) ?? undefined;
      const priceId = (it.productPriceId as string) ?? (it.priceId as string) ?? undefined;
      const status = mapPolarSubscriptionStatus((it.status as string) ?? (it.state as string));
      const currentPeriodEnd = it.currentPeriodEnd
        ? new Date(it.currentPeriodEnd as string)
        : it.current_period_end
          ? new Date(it.current_period_end as string)
          : null;
      const trialEnd = it.trialEnd ? new Date(it.trialEnd as string) : null;

      return {
        id,
        provider: "polar" as const,
        providerSubscriptionId: id,
        userId: input.userId ?? customerId ?? id,
        status,
        currentPeriodEnd,
        trialEnd,
        priceId: priceId ?? null,
        productId: productId ?? null,
        metadata: it.metadata as Record<string, unknown> | undefined,
        customerId,
        createdAt: it.createdAt ? new Date(it.createdAt as string) : undefined,
        updatedAt: it.modifiedAt ? new Date(it.modifiedAt as string) : undefined,
      } satisfies Subscription;
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`POLAR_LIST_SUBSCRIPTIONS_FAILED: ${msg}`);
  }
}
