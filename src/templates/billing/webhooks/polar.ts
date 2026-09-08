/**
 * Polar webhook route template — now delegates to factory single source of truth.
 */

import type { TemplateFile } from "../../shared.js";
import { webhookContent } from "./factory.js";

export function polarWebhookFiles(): TemplateFile[] {
  return [
    webhookContent("polar", "next", "monorepo"),
    webhookContent("polar", "next", "single"),
    webhookContent("polar", "tanstack", "monorepo"),
    webhookContent("polar", "tanstack", "single"),
  ];
}

export const polarWebhookMonorepo = webhookContent("polar", "next", "monorepo").content;
export const polarWebhookSingle = webhookContent("polar", "next", "single").content;
