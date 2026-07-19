/**
 * Chargily listSubscriptions — emulates subscriptions via checkouts (checkout-only).
 */
import {
  ensureServerOnly,
  getChargilyClient,
  genId,
  mapChargilyStatusToDomain,
  type ChargilyProviderConfig,
} from "./client.js";
import type { ListSubscriptionsInput, Subscription } from "../interface.js";

export async function listChargilySubscriptions(
  listInput?: ListSubscriptionsInput,
  config?: ChargilyProviderConfig | Record<string, unknown>,
): Promise<Subscription[]> {
  ensureServerOnly();
  const c = getChargilyClient(config);
  try {
    const perPage = Math.min(Math.max(listInput?.limit ?? 20, 1), 100);
    const list = await c.listCheckouts(perPage);
    const raw =
      (list as unknown as { data?: unknown[] }).data ?? (list as unknown as unknown[]) ?? [];
    let checkouts = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];

    if (listInput?.customerId) {
      const cid = listInput.customerId;
      checkouts = checkouts.filter((ch) => (ch.customer_id as string | undefined) === cid);
    }
    if (listInput?.status && listInput.status !== "all") {
      const statuses = Array.isArray(listInput.status) ? listInput.status : [listInput.status];
      const mapStatus = (s: string): string[] => {
        const m: Record<string, string[]> = {
          active: ["paid", "completed"],
          canceled: ["failed", "canceled", "cancelled"],
          unpaid: ["failed"],
          incomplete: ["pending", "processing", "open"],
          incomplete_expired: ["failed", "canceled", "expired"],
          expired: ["failed", "canceled", "expired"],
          past_due: ["failed"],
        };
        return m[s] ?? [s];
      };
      const allowed = new Set(statuses.flatMap(mapStatus));
      if (allowed.size > 0)
        checkouts = checkouts.filter((ch) => allowed.has((ch.status as string) ?? ""));
    }

    return checkouts.map((ch) => {
      const meta = (ch.metadata as Record<string, unknown> | undefined) ?? undefined;
      const createdAtRaw = ch.created_at as number | undefined;
      const updatedAtRaw = ch.updated_at as number | undefined;
      return {
        id: (ch.id as string) ?? genId("chk"),
        provider: "chargily" as const,
        providerSubscriptionId: (ch.id as string) ?? "",
        userId:
          (meta?.userId as string | undefined) ??
          (meta?.chargily_user_id as string | undefined) ??
          listInput?.userId ??
          "",
        status: mapChargilyStatusToDomain(ch.status as string | undefined),
        currentPeriodEnd: null,
        trialEnd: null,
        priceId: (meta?.priceId as string | undefined) ?? null,
        productId: (meta?.productId as string | undefined) ?? null,
        metadata: (meta as Record<string, unknown> | null) ?? null,
        customerId: (ch.customer_id as string | undefined) ?? undefined,
        createdAt: typeof createdAtRaw === "number" ? new Date(createdAtRaw * 1000) : new Date(),
        updatedAt: typeof updatedAtRaw === "number" ? new Date(updatedAtRaw * 1000) : new Date(),
      } as Subscription;
    });
  } catch {
    return [];
  }
}
