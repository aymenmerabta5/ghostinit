/**
 * Stripe list subscriptions — paginated, handles status filters.
 */
import type Stripe from "stripe";
import type { ListSubscriptionsInput, Subscription } from "../interface.js";
import { resolveStripeStatusFilter, mapStripeSubscriptionToDomain } from "./mappers.js";

export async function listStripeSubscriptions(
  stripe: Stripe,
  input: ListSubscriptionsInput,
): Promise<Subscription[]> {
  const statusFilter = resolveStripeStatusFilter(input.status);
  const limit = input.limit ?? 20;

  const listParams: Stripe.SubscriptionListParams = {
    limit,
    ...(input.customerId ? { customer: input.customerId } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    expand: ["data.default_payment_method"],
  };

  const result = await stripe.subscriptions.list(listParams);
  let subs = result.data.map((s: Stripe.Subscription) =>
    mapStripeSubscriptionToDomain(s, input.userId),
  );

  if (Array.isArray(input.status) && input.status.length > 1) {
    const wanted = new Set(input.status);
    subs = subs.filter((s: Subscription) => wanted.has(s.status));
  }
  return subs;
}
