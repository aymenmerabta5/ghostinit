/**
 * Polar mappers and helpers.
 */
import type { SubscriptionStatus } from "../interface.js";
import type { CreateCheckoutInput } from "../interface.js";

export function mapPolarSubscriptionStatus(raw: string | undefined): SubscriptionStatus {
  if (!raw) return "active";
  const s = raw.toLowerCase();
  switch (s) {
    case "active":
      return "active";
    case "trialing":
    case "on_trial":
    case "trial":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "cancelled":
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
      return "expired";
    case "revoked":
      return "canceled";
    default:
      return "active";
  }
}

export function polarProductIdsOrIds(input: CreateCheckoutInput): string[] {
  if (input.productId) return [input.productId];
  return [input.priceId];
}
