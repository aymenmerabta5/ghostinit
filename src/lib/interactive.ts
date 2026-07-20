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
  type ProjectMode,
  type BillingProviderName,
  type FeatureName,
  type DatabaseProvider,
  type FrameworkName,
  type AppName,
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
}

export interface ParsedCreateArgs {
  mode: ProjectMode;
  billing: BillingProviderName[];
  features: FeatureName[];
  database: DatabaseProvider;
  framework: FrameworkName;
  apps: AppName[];
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
 */
export function parseCreateArgs(
  flags: Record<string, string | string[] | boolean | undefined> | CreateFlagBag,
): ParsedCreateArgs {
  const bag = flags as CreateFlagBag;

  const modeRaw = lastOrUndefined(bag.mode);
  const databaseRaw = lastOrUndefined(bag.database);
  const frameworkRaw = lastOrUndefined(bag.framework);

  const billingCombined = combineToSingleString(bag.billing);
  const featuresCombined = combineToSingleString(bag.features);
  const appsCombined = combineToSingleString(bag.apps);

  const mode = parseModeInput(modeRaw);
  const billing = parseBillingInput(billingCombined);
  const features = parseFeaturesInput(featuresCombined);
  const database = parseDatabaseInput(databaseRaw);
  const framework = parseFrameworkInput(frameworkRaw);
  const apps = parseAppsInput(appsCombined);

  return { mode, billing, features, database, framework, apps };
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
