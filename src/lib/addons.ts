// @allow-long 430: addon registry consolidated billing+apps+features parsing with forward-compat unknown-token handling, single source for host+generated
/**
 * Addon registry — single source of truth for flexible options.
 *
 * Inspired by create-t3-app's installers. This module provides the
 * allowed values for project modes, billing providers, features,
 * and database providers used by config schema and CLI.
 *
 * - availableModes: monorepo vs single (single = all-in-one Next.js)
 * - billingProviders: stripe, chargily, paddle, polar — any combo none/both/one/all
 *   Flexible billing: Chargily is Algeria-specific EDAHABIA/CIB, can be used alone
 *   for Algeria market, global alone (stripe/paddle/polar alone or together) for
 *   international, or combined Chargily + any global provider (e.g., chargily+stripe)
 *   for Algeria + global coverage. Any combo allowed: none, one, multi, all.
 *   Examples: --billing chargily, --billing stripe, --billing chargily,stripe, --billing all
 *   Legacy: both = stripe+chargily kept for backward compat.
 * - availableFeatures: eve, i18n (false default)
 * - availableDatabases: postgres (default), convex, none
 * - defaultAddons: always included in both modes
 *
 * Billing design intent:
 * - Chargily alone -> ["chargily"] DZ EDAHABIA/CIB checkout-only, server-only, manual recurring via cron
 * - Global alone -> ["stripe"] or ["paddle"] or ["polar"] or ["stripe","paddle"] etc international
 * - Dual market -> ["chargily","stripe"] or ["chargily","paddle","polar"] etc Algeria + Global
 * - all -> all 4 providers
 * - none/"" -> []
 * No validation blocks chargily+global combo — any combination is explicitly supported.
 */

import { ValidationError } from "./errors.js";
import {
  BILLING_PROVIDERS,
  type BillingProviderName as BillingProviderNameFromConstants,
} from "./constants.js";

// Re-export canonical billing constants from constants.ts (single source) for compat
export {
  BILLING_PROVIDERS,
  BILLING_PROVIDERS as billingProviders,
  ALL_BILLING_PROVIDERS,
} from "./constants.js";
export type { BillingProviderName } from "./constants.js";

// Local type alias for internal use – canonical type from constants
type BillingProviderName = BillingProviderNameFromConstants;

export const availableModes = ["monorepo", "single"] as const;
export type ProjectMode = (typeof availableModes)[number];

export const availableFrameworks = ["nextjs", "tanstack-start"] as const;
export type FrameworkName = (typeof availableFrameworks)[number];

export const availableApps = ["web", "mobile"] as const;
export type AppName = (typeof availableApps)[number];

export const availableFeatures = ["eve", "i18n"] as const;
export type FeatureName = (typeof availableFeatures)[number];

export const availableDatabases = ["postgres", "convex", "none"] as const;
export type DatabaseProvider = (typeof availableDatabases)[number];

export const defaultAddons = [
  "auth",
  "lint",
  "format",
  "t3env",
  "database",
  "api",
  "ui",
  "services",
  "tanstack",
  "zod",
  "email",
  "analytics",
] as const;
export type DefaultAddon = (typeof defaultAddons)[number];

export type AddonKey =
  | DefaultAddon
  | BillingProviderName
  | FeatureName
  | DatabaseProvider
  | ProjectMode
  | FrameworkName
  | AppName;

export interface AddonInstaller {
  inUse: boolean;
}

export type AddonInstallerMap = Record<AddonKey, AddonInstaller> & Record<string, AddonInstaller>;

/* ------------------------------------------------------------------ */
/* Billing parsing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Parse billing input supporting flexible Algeria + Global combos.
 *
 * Flexible billing: Chargily is Algeria-specific EDAHABIA/CIB, can be used alone
 * for Algeria market, alone global for international, or combined Chargily + global
 * (e.g., chargily+stripe) for Algeria + global coverage. Any combo allowed: none,
 * one, multi, all. Examples: --billing chargily, --billing stripe,
 * --billing chargily,stripe, --billing all
 *
 * Supported inputs:
 * - "none" / "" / undefined / whitespace -> [] (no billing)
 * - "all" -> all 4 providers (stripe, chargily, paddle, polar)
 * - "both" legacy -> stripe + chargily (backward compat, = Algeria + Global starter)
 * - comma-separated, case-insensitive, deduped, trimmed — any combo explicitly allowed:
 *   e.g. "stripe" => ["stripe"] global alone international
 *        "chargily" => ["chargily"] Algeria EDAHABIA/CIB alone
 *        "chargily,stripe" => ["chargily","stripe"] Algeria + Global dual market
 *        "chargily,paddle" => ["chargily","paddle"] Algeria + Paddle MoR
 *        "chargily,polar" => ["chargily","polar"] Algeria + Polar metering
 *        "stripe,polar" => ["stripe","polar"] global multi
 *        "chargily,stripe,paddle,polar" / "all" => all 4 providers
 *        "stripe, stripe , Stripe" => ["stripe"] deduped case-insensitive
 *        "polar,both" => ["polar","stripe","chargily"] both expands inside list
 *
 * Unknown tokens are ignored when at least one known token exists
 * (forward-compatibility: "stripe,unknown,chargily" => ["stripe","chargily"]).
 * This is deterministic, no timestamps.
 * If input is non-empty and result would be empty and contains no explicit
 * "none", we throw ValidationError to avoid silent fallback for fully
 * unknown billing provider (P0 fix). Strict validation for --mode/--database
 * always throws.
 *
 * No validation blocks chargily+global combo — any combination of
 * chargily + stripe/paddle/polar is valid by design.
 */
export function parseBillingInput(input?: string): BillingProviderName[] {
  if (!input) return [];
  const trimmedInput = input.trim();
  if (trimmedInput === "") return [];
  const normalized = trimmedInput.toLowerCase();
  if (normalized === "none") return [];
  if (normalized === "all") return [...BILLING_PROVIDERS];
  if (normalized === "both") return ["stripe", "chargily"];

  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  const result: BillingProviderName[] = [];

  for (const part of parts) {
    const p = part.trim().toLowerCase();
    if (p === "" || p === "none") continue;
    if (p === "all") return [...BILLING_PROVIDERS];
    if (p === "both") {
      if (!result.includes("stripe")) result.push("stripe");
      if (!result.includes("chargily")) result.push("chargily");
      continue;
    }
    if ((BILLING_PROVIDERS as readonly string[]).includes(p)) {
      const typed = p as BillingProviderName;
      if (!result.includes(typed)) result.push(typed);
    }
    // Unknown tokens are intentionally ignored here for partial matches,
    // but fully-unknown input will be rejected after the loop (see below).
  }

  if (result.length === 0) {
    // If result is empty, check whether input contained meaningful non-none tokens.
    // If user explicitly passed "none" anywhere, treat as [] (no throw).
    // Otherwise, fully unknown like "foobar" or "foo,bar" must throw ValidationError.
    const hasExplicitNone = parts.includes("none");
    const hasMeaningfulToken = parts.some((p) => p !== "" && p !== "none");
    if (hasMeaningfulToken && !hasExplicitNone) {
      throw new ValidationError(
        `Invalid --billing value: ${input}. Allowed: ${BILLING_PROVIDERS.join(", ")}, all, both, none`,
      );
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Features parsing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parse features input:
 * - "none"/""/undefined -> []
 * - comma-separated, case-insensitive, deduped, trimmed
 *   e.g. "eve,i18n" => ["eve","i18n"]
 *        "eve, eve , EVE" => ["eve"]
 *
 * Unknown tokens are ignored when at least one known token exists
 * (forward-compatibility: "eve,unknown" => ["eve"]).
 * If input is non-empty and result would be empty and contains no explicit
 * "none", we throw ValidationError to avoid silent fallback for fully
 * unknown feature (mirror parseBillingInput logic).
 * Deterministic, no side effects.
 */
export function parseFeaturesInput(input?: string): FeatureName[] {
  if (!input) return [];
  const trimmedInput = input.trim();
  if (trimmedInput === "") return [];
  const normalized = trimmedInput.toLowerCase();
  if (normalized === "none") return [];

  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  const result: FeatureName[] = [];

  for (const raw of parts) {
    const p = raw.trim().toLowerCase();
    if (p === "" || p === "none") continue;
    if ((availableFeatures as readonly string[]).includes(p)) {
      const typed = p as FeatureName;
      if (!result.includes(typed)) result.push(typed);
    }
    // Unknown tokens intentionally ignored for partial matches,
    // but fully-unknown input will be rejected after the loop.
  }

  if (result.length === 0) {
    const hasExplicitNone = parts.includes("none");
    const hasMeaningfulToken = parts.some((p) => p !== "" && p !== "none");
    if (hasMeaningfulToken && !hasExplicitNone) {
      throw new ValidationError(
        `Invalid --features value: ${input}. Allowed: ${availableFeatures.join(", ")}, none`,
      );
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Database parsing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Parse mode input:
 * - undefined / "" / whitespace -> "monorepo" default
 * - case-insensitive, trimmed
 * - valid values: monorepo, single
 * - invalid -> throws ValidationError (P0 fix: no silent fallback)
 */
export function parseModeInput(input?: string): ProjectMode {
  if (!input) return "monorepo";
  const trimmed = input.trim();
  if (trimmed === "") return "monorepo";
  const normalized = trimmed.toLowerCase();
  if ((availableModes as readonly string[]).includes(normalized)) {
    return normalized as ProjectMode;
  }
  throw new ValidationError(
    `Invalid --mode value: ${input}. Allowed: ${availableModes.join(", ")}`,
  );
}

/**
 * Parse framework input:
 * - undefined / "" / whitespace -> "nextjs" default
 * - case-insensitive, trimmed
 * - valid values: nextjs, tanstack-start
 * - invalid -> throws ValidationError
 */
export function parseFrameworkInput(input?: string): FrameworkName {
  if (!input) return "nextjs";
  const trimmed = input.trim();
  if (trimmed === "") return "nextjs";
  const normalized = trimmed.toLowerCase();
  if ((availableFrameworks as readonly string[]).includes(normalized)) {
    return normalized as FrameworkName;
  }
  throw new ValidationError(
    `Invalid --framework value: ${input}. Allowed: ${availableFrameworks.join(", ")}`,
  );
}

/**
 * Parse database input:
 * - undefined / "" / whitespace -> "postgres" default
 * - case-insensitive, trimmed
 * - valid values: postgres, convex, none
 * - invalid -> throws ValidationError (P0 fix: no silent fallback)
 */
export function parseDatabaseInput(input?: string): DatabaseProvider {
  if (!input) return "postgres";
  const trimmed = input.trim();
  if (trimmed === "") return "postgres";
  const normalized = trimmed.toLowerCase();
  if ((availableDatabases as readonly string[]).includes(normalized)) {
    return normalized as DatabaseProvider;
  }
  throw new ValidationError(
    `Invalid --database value: ${input}. Allowed: ${availableDatabases.join(", ")}`,
  );
}

/* ------------------------------------------------------------------ */
/* Apps parsing                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse apps input:
 * - undefined / "" / whitespace -> ["web"] default (backward compat)
 * - "none" -> [] (let isValidAddonCombo report missing app)
 * - "all" / "both" -> ["web","mobile"]
 * - comma/whitespace separated, case-insensitive, deduped
 *   e.g. "web" => ["web"], "mobile" => ["mobile"]
 *        "web,mobile" / "both" / "all" => ["web","mobile"]
 * - Unknown tokens ignored when at least one known exists (forward-compat)
 * - Fully unknown non-empty (no explicit none) throws ValidationError
 */
export function parseAppsInput(input?: string): AppName[] {
  if (!input) return ["web"];
  const trimmedInput = input.trim();
  if (trimmedInput === "") return ["web"];
  const normalized = trimmedInput.toLowerCase();
  if (normalized === "none") return [];
  if (normalized === "all" || normalized === "both") return [...availableApps];

  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  const result: AppName[] = [];
  for (const raw of parts) {
    const p = raw.trim().toLowerCase();
    if (p === "" || p === "none") continue;
    if (p === "all" || p === "both") return [...availableApps];
    if ((availableApps as readonly string[]).includes(p)) {
      const typed = p as AppName;
      if (!result.includes(typed)) result.push(typed);
    }
  }
  if (result.length === 0) {
    const hasExplicitNone = parts.includes("none");
    const hasMeaningful = parts.some((t) => t !== "" && t !== "none");
    if (hasMeaningful && !hasExplicitNone) {
      throw new ValidationError(
        `Invalid --apps value: ${input}. Allowed: ${availableApps.join(", ")}, both, all`,
      );
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Compatibility validation                                           */
/* ------------------------------------------------------------------ */

export function isValidAddonCombo(options: {
  billing: BillingProviderName[];
  database: DatabaseProvider;
  mode: ProjectMode;
  framework?: FrameworkName;
  apps?: AppName[];
}): { valid: boolean; message?: string } {
  const apps = options.apps ?? ["web" as AppName];
  if (options.billing.length > 0 && options.database === "none") {
    return {
      valid: false,
      message:
        "Billing requires at least postgres or convex for subscriptions table, but database is none",
    };
  }
  if (apps.length === 0) {
    return {
      valid: false,
      message: "At least one app target required --apps web, mobile, or both",
    };
  }
  if (
    options.mode === "single" &&
    apps.includes("web" as AppName) &&
    apps.includes("mobile" as AppName)
  ) {
    return {
      valid: false,
      message:
        "Single mode supports only one app target --apps web or --apps mobile, not both. Use monorepo for web+mobile",
    };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/* Installer map                                                      */
/* ------------------------------------------------------------------ */

export interface BuildAddonMapInput {
  billing: BillingProviderName[];
  features: FeatureName[];
  database: DatabaseProvider;
  mode: ProjectMode;
  framework?: FrameworkName;
  apps?: AppName[];
}

/**
 * Build a map of all known addon keys to { inUse }.
 *
 * Semantics:
 * - defaultAddons (auth, lint, format, t3env, database, api, ui, services, tanstack, zod, email) always inUse true
 * - billingProviders: true if included in billing array
 * - availableFeatures: true if included in features array
 * - availableDatabases: true if database exactly matches
 * - availableModes: true if mode exactly matches
 *
 * The map mirrors create-t3-app's buildPkgInstallerMap pattern but for GhostInit's TemplateFile[] composition.
 */
export function buildAddonInstallerMap(input: BuildAddonMapInput): AddonInstallerMap {
  const allKeys = new Set<string>([
    ...defaultAddons,
    ...BILLING_PROVIDERS,
    ...availableFeatures,
    ...availableDatabases,
    ...availableModes,
    ...availableFrameworks,
    ...availableApps,
  ]);
  const map: Record<string, AddonInstaller> = {};
  for (const key of allKeys) map[key] = { inUse: false };
  for (const addon of defaultAddons) map[addon] = { inUse: true };
  for (const m of availableModes) map[m] = { inUse: m === input.mode };
  for (const d of availableDatabases) map[d] = { inUse: false };
  map[input.database] = { inUse: true };
  for (const f of availableFeatures) map[f] = { inUse: input.features.includes(f) };
  for (const b of BILLING_PROVIDERS)
    map[b] = { inUse: input.billing.includes(b as BillingProviderName) };
  const effectiveFramework = input.framework ?? "nextjs";
  for (const f of availableFrameworks) map[f] = { inUse: f === effectiveFramework };
  const effectiveApps = input.apps ?? (["web"] as AppName[]);
  for (const a of availableApps) map[a] = { inUse: (effectiveApps as string[]).includes(a) };
  return map as AddonInstallerMap;
}

export function hasAddon(map: AddonInstallerMap | undefined, key: string): boolean {
  if (!map) return false;
  return Boolean(map[key]?.inUse);
}

export function isAddonInstallerMap(input: unknown): input is AddonInstallerMap {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const rec = input as Record<string, unknown>;
  for (const v of Object.values(rec)) {
    if (typeof v === "object" && v !== null && "inUse" in (v as Record<string, unknown>))
      return true;
  }
  return false;
}

export function getFeatureFlag(
  input: boolean | AddonInstallerMap | Record<string, { inUse?: boolean }> | undefined,
  feature: string,
): boolean {
  if (typeof input === "boolean") return input;
  if (!input) return false;
  const rec = input as Record<string, { inUse?: boolean }>;
  return Boolean(rec[feature]?.inUse);
}
