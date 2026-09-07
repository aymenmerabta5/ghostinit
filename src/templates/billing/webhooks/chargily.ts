/**
 * Chargily webhook route template — now delegates to factory single source of truth.
 */

import type { TemplateFile } from "../../shared.js";
import { webhookContent } from "./factory.js";

export function chargilyWebhookFiles(): TemplateFile[] {
  return [
    webhookContent("chargily", "next", "monorepo"),
    webhookContent("chargily", "next", "single"),
    webhookContent("chargily", "tanstack", "monorepo"),
    webhookContent("chargily", "tanstack", "single"),
  ];
}

export const chargilyWebhookMonorepo = webhookContent("chargily", "next", "monorepo").content;
export const chargilyWebhookSingle = webhookContent("chargily", "next", "single").content;
