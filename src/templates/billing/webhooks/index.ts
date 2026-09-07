/**
 * Billing webhooks barrel — re-exports full implementations for all 4 providers.
 * Now factory is single source of truth, provider files delegate to it.
 */

export { stripeWebhookFiles, stripeWebhookMonorepo, stripeWebhookSingle } from "./stripe.js";
export {
  chargilyWebhookFiles,
  chargilyWebhookMonorepo,
  chargilyWebhookSingle,
} from "./chargily.js";
export { paddleWebhookFiles, paddleWebhookMonorepo, paddleWebhookSingle } from "./paddle.js";
export { polarWebhookFiles, polarWebhookMonorepo, polarWebhookSingle } from "./polar.js";
export {
  webhookContent,
  webhookFilesForProvider,
  allWebhookFiles as allWebhookFilesFromFactory,
  webhookFilesFiltered,
  type BillingProviderName,
  type WebhookFramework,
  type WebhookMode,
} from "./factory.js";

import { stripeWebhookFiles } from "./stripe.js";
import { chargilyWebhookFiles } from "./chargily.js";
import { paddleWebhookFiles } from "./paddle.js";
import { polarWebhookFiles } from "./polar.js";
import type { TemplateFile } from "../../shared.js";

export function allWebhookFiles(): TemplateFile[] {
  return [
    ...stripeWebhookFiles(),
    ...chargilyWebhookFiles(),
    ...paddleWebhookFiles(),
    ...polarWebhookFiles(),
  ];
}

export function billingWebhookFilesByProvider(
  provider: "stripe" | "chargily" | "paddle" | "polar",
): TemplateFile[] {
  switch (provider) {
    case "stripe":
      return stripeWebhookFiles();
    case "chargily":
      return chargilyWebhookFiles();
    case "paddle":
      return paddleWebhookFiles();
    case "polar":
      return polarWebhookFiles();
    default:
      return [];
  }
}
