/**
 * Paddle mappers.
 */
import type { SubscriptionStatus } from "../interface.js";

export function mapSubscriptionStatus(paddleStatus?: string): SubscriptionStatus {
  switch (paddleStatus) {
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
      return "active";
  }
}

export function genId(prefix: string): string {
  try {
    const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID().slice(0, 8)}`;
  } catch {}
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
