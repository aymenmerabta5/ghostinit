/**
 * Stripe webhook route template — now delegates to factory single source of truth.
 * Verification logic only exists in factory.ts, not duplicated 12x.
 */

import type { TemplateFile } from "../../shared.js";
import { webhookContent } from "./factory.js";

export function stripeWebhookFiles(): TemplateFile[] {
  return [
    webhookContent("stripe", "next", "monorepo"),
    webhookContent("stripe", "next", "single"),
    webhookContent("stripe", "tanstack", "monorepo"),
    webhookContent("stripe", "tanstack", "single"),
  ];
}

export function stripeWebhookMonorepoContent(): string {
  return webhookContent("stripe", "next", "monorepo").content;
}
export function stripeWebhookSingleContent(): string {
  return webhookContent("stripe", "next", "single").content;
}

export const stripeWebhookMonorepo = stripeWebhookMonorepoContent();
export const stripeWebhookSingle = stripeWebhookSingleContent();
