/**
 * Shared webhook helpers — SSOT: BillingProviderName derived from
 * BILLING_PROVIDER_NAMES in providers/interface/types.ts (template) which
 * mirrors BILLING_PROVIDERS in src/lib/constants.ts (CLI).
 * Adding 5th provider: update BILLING_PROVIDER_NAMES + add provider folder.
 * getPath and getDbImports are framework-agnostic helpers.
 */

// SSOT re-export — single source of truth lives in interface/types.ts
export { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";
import { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";

export type BillingProviderName = (typeof BILLING_PROVIDER_NAMES)[number];
export type WebhookFramework = "next" | "tanstack" | "single";
export type WebhookMode = "monorepo" | "single";

export interface DbImports {
  db: string;
  billingSchema: string;
  observability: string;
}

export function getDbImports(isMonorepo: boolean): DbImports {
  if (isMonorepo) {
    return {
      db: "@repo/database",
      billingSchema: "@repo/billing",
      observability: "@repo/observability",
    };
  }
  return {
    db: "@/server/db",
    billingSchema: "@/server/db/schema/billing",
    observability: "@/server/observability",
  };
}

export function getPath(
  provider: BillingProviderName,
  framework: WebhookFramework,
  mode: WebhookMode,
): string {
  const isMonorepo = mode === "monorepo";
  if (framework === "tanstack") {
    return isMonorepo
      ? `apps/web/src/routes/api/webhooks/${provider}.ts`
      : `src/routes/api/webhooks/${provider}.ts`;
  }
  return isMonorepo
    ? `apps/web/src/app/api/webhooks/${provider}/route.ts`
    : `src/app/api/webhooks/${provider}/route.ts`;
}

export const RAW_BODY_COMMENT =
  "// CRITICAL: raw body Buffer — MUST be Buffer.from(await request.arrayBuffer()) NOT req.json() else 403 signature failure";

export const IDEMPOTENCY_COMMENT =
  "// Idempotent via webhook_events unique(provider+providerEventId) — required query, no optional chaining swallowing";
