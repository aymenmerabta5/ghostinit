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

/**
 * DbImports plus the Convex-specific context a provider fragment needs.
 * `convexApi` is pre-resolved by the factory so provider fragments never
 * hardcode `../../` depths — see convexApiImport below.
 */
export interface ConvexImports extends DbImports {
  isConvex?: boolean;
  isMonorepo?: boolean;
  convexApi?: string;
}

/**
 * Relative specifier from a generated file to the root-level `convex/_generated/api`.
 *
 * The `convex/` directory is always emitted at the project root in BOTH monorepo
 * and single mode (see modes/single/composers/*.ts which filter on `convex/`).
 * Hardcoding a fixed `../../../` depth silently breaks whenever a route sits at a
 * different nesting level — e.g. `apps/web/src/app/api/webhooks/<p>/route.ts` is
 * seven directories deep, not three. Derive it from the file's own path instead.
 */
export function convexApiImport(fromFile: string): string {
  const dir = posixDirname(fromFile);
  const target = "convex/_generated/api";
  if (dir === "") return `./${target}`;
  const up = "../".repeat(dir.split("/").length);
  return `${up}${target}`;
}

/**
 * Resolve the `convex/_generated/api` specifier for a provider fragment.
 *
 * Prefers the value the factory already computed from the real emitted path;
 * falls back to deriving it from getPath() so a fragment rendered outside the
 * factory (tests, direct calls) still gets a correct depth rather than a
 * hardcoded guess.
 */
export function convexApiFor(
  imp: DbImports,
  provider: BillingProviderName,
  framework: Exclude<WebhookFramework, "single">,
): string {
  const provided = (imp as ConvexImports).convexApi;
  if (provided) return provided;
  const mode: WebhookMode = imp.db.includes("@repo/database") ? "monorepo" : "single";
  return convexApiImport(getPath(provider, framework, mode));
}

function posixDirname(p: string): string {
  const normalized = p.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.slice(0, idx);
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
