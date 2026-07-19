// @ts-nocheck - template, depends on drizzle-orm not installed in CLI
import { pgEnum } from "drizzle-orm/pg-core";

export const billingProviderEnum = pgEnum("billing_provider", [
  "stripe",
  "chargily",
  "paddle",
  "polar",
]);

export const subscriptionStatusEnum = pgEnum("billing_subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
  "expired",
  "on_trial",
  "trial_ended",
]);

export const checkoutStatusEnum = pgEnum("billing_checkout_status", [
  "pending",
  "paid",
  "completed",
  "failed",
  "open",
  "expired",
]);

export const invoiceStatusEnum = pgEnum("billing_invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);

export const licenseKeyStatusEnum = pgEnum("billing_license_key_status", [
  "active",
  "revoked",
  "expired",
]);

export const recurringIntervalEnum = pgEnum("billing_recurring_interval", [
  "month",
  "year",
  "week",
  "day",
  "one_time",
]);
