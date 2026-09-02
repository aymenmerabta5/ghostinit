/**
 * Chargily listSubscriptions — emulates subscriptions via checkouts (checkout-only).
 */
import {
  ensureServerOnly,
  getChargilyClient,
  mapChargilyStatusToDomain,
  type ChargilyProviderConfig,
} from "./client.js";
import type { ListSubscriptionsInput, Subscription } from "../interface.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function listChargilySubscriptions(
  listInput?: ListSubscriptionsInput,
  config?: ChargilyProviderConfig | Record<string, unknown>,
): Promise<Subscription[]> {
  ensureServerOnly();
  const c = getChargilyClient(config);
  const perPage = Math.min(Math.max(listInput?.limit ?? 20, 1), 100);
  const list = await c.listCheckouts(perPage);
  let checkouts = list.data;

  if (listInput?.customerId) {
    const cid = listInput.customerId;
    checkouts = checkouts.filter((ch) => ch.customer_id === cid);
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
    if (allowed.size > 0) checkouts = checkouts.filter((ch) => allowed.has(ch.status));
  }

  return checkouts.map((ch): Subscription => {
    const id = optionalString(ch.id);
    if (!id) throw new Error("Chargily checkout response is missing a stable id");
    const metadata = isRecord(ch.metadata) ? ch.metadata : undefined;
    const createdAtRaw = ch.created_at;
    const updatedAtRaw = ch.updated_at;
    return {
      id,
      provider: "chargily",
      providerSubscriptionId: id,
      userId:
        optionalString(metadata?.userId) ??
        optionalString(metadata?.chargily_user_id) ??
        listInput?.userId ??
        "",
      status: mapChargilyStatusToDomain(ch.status),
      currentPeriodEnd: null,
      trialEnd: null,
      priceId: optionalString(metadata?.priceId) ?? null,
      productId: optionalString(metadata?.productId) ?? null,
      metadata: metadata ?? null,
      customerId: ch.customer_id ?? undefined,
      createdAt: typeof createdAtRaw === "number" ? new Date(createdAtRaw * 1000) : new Date(),
      updatedAt: typeof updatedAtRaw === "number" ? new Date(updatedAtRaw * 1000) : new Date(),
    };
  });
}
