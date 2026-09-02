/**
 * Paddle mappers.
 */
import type { SubscriptionStatus } from "../interface.js";

export function mapSubscriptionStatus(paddleStatus?: string): SubscriptionStatus {
  switch (paddleStatus?.trim().toLowerCase()) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "paused":
      return "paused";
    default:
      // Unknown/missing provider state must never grant entitlement.
      return "incomplete";
  }
}

export function requirePaddleResponseString(
  value: unknown,
  operation: string,
  field: string,
): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`Paddle ${operation}: provider response did not include ${field}`);
}
