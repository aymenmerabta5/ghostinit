import type { InvoiceStatus, SubscriptionStatus } from "../domain/model.js";
import { EN_BILLING_STATUS_MESSAGES } from "../../i18n/messages/billing-status.js";
type StatusMessageKey = keyof typeof EN_BILLING_STATUS_MESSAGES;
const subscriptionKeys = {
  active: "subscriptionStatusActive",
  trialing: "subscriptionStatusTrialing",
  past_due: "subscriptionStatusPastDue",
  canceled: "subscriptionStatusCanceled",
  unpaid: "subscriptionStatusUnpaid",
  incomplete: "subscriptionStatusIncomplete",
  incomplete_expired: "subscriptionStatusIncompleteExpired",
  paused: "subscriptionStatusPaused",
  expired: "subscriptionStatusExpired",
  on_trial: "subscriptionStatusOnTrial",
  trial_ended: "subscriptionStatusTrialEnded",
} satisfies Record<SubscriptionStatus, StatusMessageKey>;
const invoiceKeys = {
  draft: "invoiceStatusDraft",
  open: "invoiceStatusOpen",
  paid: "invoiceStatusPaid",
  void: "invoiceStatusVoid",
  uncollectible: "invoiceStatusUncollectible",
} satisfies Record<InvoiceStatus, StatusMessageKey>;
/** Presentation-only labels: raw domain state continues to drive every decision. */
export function billingStatusContent(): string {
  return [
    "const ENGLISH_STATUS_LABELS = " + JSON.stringify(EN_BILLING_STATUS_MESSAGES) + " as const;",
    "export type BillingStatusLabelKey = keyof typeof ENGLISH_STATUS_LABELS;",
    "export type BillingStatusTranslate = (key: BillingStatusLabelKey) => string;",
    "const SUBSCRIPTION_STATUS_KEYS: Readonly<Record<string, BillingStatusLabelKey>> = " +
      JSON.stringify(subscriptionKeys) +
      ";",
    "const INVOICE_STATUS_KEYS: Readonly<Record<string, BillingStatusLabelKey>> = " +
      JSON.stringify(invoiceKeys) +
      ";",
    "",
    "function englishStatusLabel(key: BillingStatusLabelKey): string { return ENGLISH_STATUS_LABELS[key]; }",
    "",
    "export function formatBillingSubscriptionStatus(status: unknown, translate: BillingStatusTranslate = englishStatusLabel): string {",
    '  const key = typeof status === "string" && Object.hasOwn(SUBSCRIPTION_STATUS_KEYS, status) ? SUBSCRIPTION_STATUS_KEYS[status] : undefined;',
    '  return translate(key ?? "subscriptionStatusUnknown");',
    "}",
    "",
    "export function formatBillingInvoiceStatus(status: unknown, translate: BillingStatusTranslate = englishStatusLabel): string {",
    '  const key = typeof status === "string" && Object.hasOwn(INVOICE_STATUS_KEYS, status) ? INVOICE_STATUS_KEYS[status] : undefined;',
    '  return translate(key ?? "invoiceStatusUnknown");',
    "}",
    "",
  ].join("\n");
}
