/**
 * Stripe status mappers + subscription mapper.
 */
import type Stripe from "stripe";
import type { Subscription, SubscriptionStatus } from "../interface.js";

export function mapStripeStatusToDomain(status?: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "paused";
    case "ended":
      return "expired";
    default:
      return "incomplete";
  }
}

export function mapDomainStatusToStripe(
  status: SubscriptionStatus | "all",
): Stripe.SubscriptionListParams.Status | undefined {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
    case "on_trial":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "paused":
      return "paused";
    case "expired":
      return "ended";
    case "all":
      return "all";
    case "trial_ended":
      return "all";
    default:
      return undefined;
  }
}

export function resolveStripeStatusFilter(
  inputStatus?: SubscriptionStatus | SubscriptionStatus[] | "all",
): Stripe.SubscriptionListParams.Status | undefined {
  if (!inputStatus) return undefined;
  if (inputStatus === "all") return "all";
  if (Array.isArray(inputStatus)) {
    if (inputStatus.length === 0) return undefined;
    if (inputStatus.length > 1) return "all";
    return mapDomainStatusToStripe(inputStatus[0]);
  }
  return mapDomainStatusToStripe(inputStatus);
}

type ExpandableId = string | { id: string } | null | undefined;

function expandableId(value: ExpandableId): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function currentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEnds = subscription.items.data.map(
    (item: Stripe.SubscriptionItem) => item.current_period_end,
  );
  return periodEnds.length > 0 ? new Date(Math.min(...periodEnds) * 1000) : null;
}

export function mapStripeSubscriptionToDomain(
  sub: Stripe.Subscription,
  fallbackUserId?: string,
): Subscription {
  const firstItem = sub.items.data[0];
  const priceId = firstItem?.price?.id ?? null;
  const productId = expandableId(firstItem?.price?.product) ?? null;
  const customerId = expandableId(sub.customer) ?? "";
  const metaUserId = sub.metadata.userId ?? sub.metadata.user_id ?? fallbackUserId ?? "";

  return {
    id: sub.id,
    provider: "stripe",
    providerSubscriptionId: sub.id,
    userId: metaUserId,
    status: mapStripeStatusToDomain(sub.status),
    currentPeriodEnd: currentPeriodEnd(sub),
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    priceId,
    productId,
    metadata: sub.metadata,
    customerId,
    createdAt: new Date(sub.created * 1000),
    updatedAt: undefined,
  };
}
