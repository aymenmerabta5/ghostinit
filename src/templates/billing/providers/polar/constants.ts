/**
 * Polar webhook event constants — MoR 4%+40c + metering + license keys.
 */

export const POLAR_WEBHOOK_EVENTS = [
  "checkout.created",
  "checkout.updated",
  "checkout.expired",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "customer.state_changed",
  "customer_seat.assigned",
  "customer_seat.claimed",
  "customer_seat.revoked",
  "order.created",
  "order.updated",
  "order.paid",
  "order.refunded",
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
  "product.created",
  "product.updated",
  "benefit.created",
  "benefit.updated",
  "benefit_grant.created",
  "benefit_grant.cycled",
  "benefit_grant.updated",
  "benefit_grant.revoked",
  "refund.created",
  "refund.updated",
  "organization.updated",
] as const;

export type PolarWebhookEventType = (typeof POLAR_WEBHOOK_EVENTS)[number];
