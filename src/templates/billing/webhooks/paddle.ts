/**
 * Paddle webhook route template — now delegates to factory single source of truth.
 */

import type { TemplateFile } from "../../shared.js";
import { webhookContent } from "./factory.js";

export function paddleWebhookFiles(): TemplateFile[] {
  return [
    webhookContent("paddle", "next", "monorepo"),
    webhookContent("paddle", "next", "single"),
    webhookContent("paddle", "tanstack", "monorepo"),
    webhookContent("paddle", "tanstack", "single"),
  ];
}

export const paddleWebhookMonorepo = webhookContent("paddle", "next", "monorepo").content;
export const paddleWebhookSingle = webhookContent("paddle", "next", "single").content;
