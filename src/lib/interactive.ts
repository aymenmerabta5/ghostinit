/**
 * Interactive CLI helper — TTY detection and flag parsing for create command.
 *
 * Implements:
 * - isInteractiveMode(opts): bool if TTY and not json/yes/ci
 * - parseCreateArgs(flags): handles mode, billing (comma/repeat/both/all/none), features, database
 * - Project name validation regex and helpers
 */

import {
  parseBillingInput,
  parseFeaturesInput,
  parseDatabaseInput,
  parseFrameworkInput,
  parseModeInput,
  parseAppsInput,
  parsePresetInput,
  parseCacheInput,
  parseStackInput,
  type ProjectMode,
  type BillingProviderName,
  type FeatureName,
  type DatabaseProvider,
  type FrameworkName,
  type AppName,
  type PresetName,
  type CacheProvider,
} from "./addons.js";

export const PROJECT_NAME_RE = /^[a-z][a-z0-9-]*$/;
export const PROJECT_NAME_MESSAGE =
  "Name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens";

export interface InteractiveModeOptions {
  json?: boolean;
  yes?: boolean;
  ci?: boolean;
  isTTY?: boolean;
}

/**
 * Returns true only when running in a TTY and not in machine-readable / non-interactive modes.
 *
 * TTY detection uses process.stdout.isTTY / stdin.isTTY from caller.
 * json, yes, ci all disable interactive prompts (like create-t3-app --noTty / CI detection).
 */
export function isInteractiveMode(opts: InteractiveModeOptions): boolean {
  if (opts.json) return false;
  if (opts.yes) return false;
  if (opts.ci) return false;
  if (!opts.isTTY) return false;
  return true;
}

export interface CreateFlagBag {
  mode?: string | string[];
  billing?: string | string[];
  features?: string | string[];
  database?: string | string[];
  framework?: string | string[];
  apps?: string | string[];
  preset?: string | string[];
  cache?: string | string[];
  stack?: string | string[];
  "with-auth"?: boolean;
  "with-api"?: boolean;
  "with-email"?: boolean;
  "with-analytics"?: boolean;
  "with-cache"?: boolean;
}

export interface ParsedCreateArgs {
  mode: ProjectMode;
  billing: BillingProviderName[];
  features: FeatureName[];
  database: DatabaseProvider;
  framework: FrameworkName;
  apps: AppName[];
  preset: PresetName | undefined;
  cache: CacheProvider;
  stack: string | undefined;
  withAuth: boolean | undefined;
  withApi: boolean | undefined;
  withEmail: boolean | undefined;
  withAnalytics: boolean | undefined;
  withCache: boolean | undefined;
}

function lastOrUndefined(value?: string | string[]): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return value[value.length - 1];
  }
  return value;
}

function combineToSingleString(value?: string | string[]): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) return value.join(",");
  return value;
}

/**
 * Parse create flags handling:
 * - mode: monorepo|single (single value, last wins)
 * - billing: comma-separated or repeat (--billing stripe --billing chargily), special both/all/none, deduped
 * - features: comma-separated
 * - database: postgres|convex|none (single value, last wins)
 * - framework: nextjs|tanstack-start (single value, last wins)
 * - apps: web,mobile|both|all (comma-separated, repeatable)
 * - preset: saas|frontend|custom (single value, last wins)
 * - cache: redis|none (single value, last wins)
 * - stack: nextjs|tanstack-start|expo|both (single value)
 */
export function parseCreateArgs(
  flags: Record<string, string | string[] | boolean | undefined> | CreateFlagBag,
): ParsedCreateArgs {
  const bag = flags as CreateFlagBag;

  const modeRaw = lastOrUndefined(bag.mode);
  const databaseRaw = lastOrUndefined(bag.database);
  const frameworkRaw = lastOrUndefined(bag.framework);
  const presetRaw = lastOrUndefined(bag.preset);
  const cacheRaw = lastOrUndefined(bag.cache);
  const stackRaw = lastOrUndefined(bag.stack);

  const billingCombined = combineToSingleString(bag.billing);
  const featuresCombined = combineToSingleString(bag.features);
  const appsCombined = combineToSingleString(bag.apps);

  const mode = parseModeInput(modeRaw);
  const billing = parseBillingInput(billingCombined);
  const features = parseFeaturesInput(featuresCombined);
  let database = parseDatabaseInput(databaseRaw);
  let framework = parseFrameworkInput(frameworkRaw);
  let apps = parseAppsInput(appsCombined);
  const preset = parsePresetInput(presetRaw);
  let cache = parseCacheInput(cacheRaw);

  // with-* booleans override cache
  const withAuth = bag["with-auth"] as boolean | undefined;
  const withApi = bag["with-api"] as boolean | undefined;
  const withEmail = bag["with-email"] as boolean | undefined;
  const withAnalytics = bag["with-analytics"] as boolean | undefined;
  const withCacheFlag = bag["with-cache"] as boolean | undefined;
  if (withCacheFlag) cache = "redis";

  // stack helper overrides framework+apps (for frontend shorthand)
  if (stackRaw) {
    const stackParsed = parseStackInput(stackRaw);
    if (stackParsed) {
      framework = stackParsed.framework;
      apps = stackParsed.apps;
    }
  }

  // preset frontend forces database none if not explicitly set (unless --with-auth without db will error later)
  // preserve explicit database if user passed --database flag, else let presetDefaults handle via build map
  // For parse stage we keep parsed database; preset handling for saas/frontend done in buildAddonInstallerMap

  return {
    mode,
    billing,
    features,
    database,
    framework,
    apps,
    preset,
    cache,
    stack: stackRaw,
    withAuth,
    withApi,
    withEmail,
    withAnalytics,
    withCache: withCacheFlag,
  };
}

/**
 * Normalize billing multiselect result from @clack/prompts.
 * Handles the special "none" option: if selected or empty, returns [].
 * Also dedupes and filters to known providers.
 */
export function normalizeBillingSelection(selection: string[]): BillingProviderName[] {
  if (!selection || selection.length === 0) return [];
  const lower = selection.map((s) => s.trim().toLowerCase());
  if (lower.includes("none")) return [];
  const input = lower.join(",");
  return parseBillingInput(input);
}

export function normalizeFeaturesSelection(selection: string[]): FeatureName[] {
  if (!selection || selection.length === 0) return [];
  const input = selection.join(",");
  return parseFeaturesInput(input);
}

export function normalizeAppsSelection(selection: string[]): AppName[] {
  if (!selection || selection.length === 0) return ["web"];
  const lower = selection.map((s) => s.trim().toLowerCase());
  if (lower.includes("none")) return [];
  const input = lower.join(",");
  return parseAppsInput(input);
}

export function validateProjectName(
  name: string,
): { valid: true } | { valid: false; reason: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: "Project name is required" };
  }
  if (!PROJECT_NAME_RE.test(name)) {
    return { valid: false, reason: `Invalid project name "${name}": ${PROJECT_NAME_MESSAGE}` };
  }
  return { valid: true };
}
