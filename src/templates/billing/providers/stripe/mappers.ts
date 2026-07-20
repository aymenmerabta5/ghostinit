/**
 * Stripe status mappers + subscription mapper.
 */
// @ts-ignore
import type Stripe from "stripe";
import type { Subscription, SubscriptionStatus } from "../interface.js";

export function mapStripeStatusToDomain(status: string): SubscriptionStatus {
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
      return "active";
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
    if ((inputStatus as string[]).includes("all")) return "all";
    if (inputStatus.length > 1) return "all";
    return mapDomainStatusToStripe(inputStatus[0] as SubscriptionStatus | "all");
  }
  return mapDomainStatusToStripe(inputStatus as SubscriptionStatus | "all");
}

type StripeSubscriptionWithLegacy = Stripe.Subscription & {
  items?: { data?: Stripe.SubscriptionItem[] };
  current_period_end?: number;
  trial_end?: number;
  created?: number;
};

export function mapStripeSubscriptionToDomain(
  sub: Stripe.Subscription,
  fallbackUserId?: string,
): Subscription {
  // vendor untyped: Stripe Subscription items field optional in older types, but present at runtime
  const legacy = sub as unknown as StripeSubscriptionWithLegacy;
  const items = legacy.items?.data as Stripe.SubscriptionItem[] | undefined;
  const firstItem = items?.[0];
  const priceId = firstItem?.price?.id ?? null;
  const productId =
    typeof firstItem?.price?.product === "string"
      ? (firstItem?.price?.product as string)
      : ((firstItem?.price?.product as Stripe.Product | undefined)?.id ?? null);
  const customerId =
    typeof sub.customer === "string"
      ? sub.customer
      : ((sub.customer as Stripe.Customer | null)?.id ?? "");
  const metaUserId =
    (sub.metadata as Record<string, string> | null)?.userId ??
    (sub.metadata as Record<string, string> | null)?.user_id ??
    fallbackUserId ??
    "";

  return {
    id: sub.id,
    provider: "stripe" as const,
    providerSubscriptionId: sub.id,
    userId: metaUserId,
    status: mapStripeStatusToDomain(sub.status),
    currentPeriodEnd: legacy.current_period_end ? new Date(legacy.current_period_end * 1000) : null,
    trialEnd: legacy.trial_end ? new Date(legacy.trial_end * 1000) : null,
    priceId,
    productId,
    metadata: sub.metadata as Record<string, unknown> | null,
    customerId,
    createdAt: legacy.created ? new Date(legacy.created * 1000) : undefined,
    updatedAt: undefined,
  };
}
