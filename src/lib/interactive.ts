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
  parseDeployInput,
  parseStackInput,
  parseFeatureFlagsInput,
  type ProjectMode,
  type BillingProviderName,
  type FeatureName,
  type DatabaseProvider,
  type FrameworkName,
  type AppName,
  type PresetName,
  type CacheProvider,
  type DeployTarget,
  type FeatureFlagProvider,
} from "./addons.js";
import { VALID_NAME_RE, validateArtifactName } from "./reserved.js";

export const PROJECT_NAME_RE = VALID_NAME_RE;
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
  deploy?: string | string[];
  stack?: string | string[];
  "with-auth"?: boolean;
  "with-api"?: boolean;
  "with-email"?: boolean;
  "with-analytics"?: boolean;
  "with-cache"?: boolean;
  "with-eve"?: boolean;
  "with-i18n"?: boolean;
  "with-pdf"?: boolean;
  "with-messaging"?: boolean;
  "with-storage"?: boolean;
  "with-notifications"?: boolean;
  "feature-flags"?: string | string[];
  "with-jobs"?: boolean;
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
  deploy: DeployTarget;
  stack: string | undefined;
  withAuth: boolean | undefined;
  withApi: boolean | undefined;
  withEmail: boolean | undefined;
  withAnalytics: boolean | undefined;
  withCache: boolean | undefined;
  withEve: boolean | undefined;
  withI18n: boolean | undefined;
  withPdf: boolean | undefined;
  withMessaging: boolean | undefined;
  withStorage: boolean | undefined;
  withNotifications: boolean | undefined;
  featureFlags: FeatureFlagProvider;
  withJobs: boolean | undefined;
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
  const deployRaw = lastOrUndefined(bag.deploy);
  const stackRaw = lastOrUndefined(bag.stack);
  const featureFlagsRaw = lastOrUndefined(bag["feature-flags"]);

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
  const deploy = parseDeployInput(deployRaw);
  const featureFlags = parseFeatureFlagsInput(featureFlagsRaw);

  // with-* booleans override cache + handle --features alias for eve/i18n (backward compat)
  let withAuth = bag["with-auth"] as boolean | undefined;
  let withApi = bag["with-api"] as boolean | undefined;
  let withEmail = bag["with-email"] as boolean | undefined;
  let withAnalytics = bag["with-analytics"] as boolean | undefined;
  const withCacheFlag = bag["with-cache"] as boolean | undefined;
  let withEve = bag["with-eve"] as boolean | undefined;
  let withI18n = bag["with-i18n"] as boolean | undefined;
  const withPdf = bag["with-pdf"] as boolean | undefined;
  const withMessaging = bag["with-messaging"] as boolean | undefined;
  const withStorage = bag["with-storage"] as boolean | undefined;
  const withNotifications = bag["with-notifications"] as boolean | undefined;
  const withJobs = bag["with-jobs"] as boolean | undefined;
  if (withCacheFlag) cache = "redis";
  // --features eve/i18n is alias for --with-eve/--with-i18n (unified addons)
  if (features.includes("eve" as never) && withEve === undefined) withEve = true;
  if (features.includes("i18n" as never) && withI18n === undefined) withI18n = true;

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
    deploy,
    stack: stackRaw,
    withAuth,
    withApi,
    withEmail,
    withAnalytics,
    withCache: withCacheFlag,
    withEve,
    withI18n,
    withPdf,
    withMessaging,
    withStorage,
    withNotifications,
    featureFlags,
    withJobs,
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
  const result = validateArtifactName(name, "project name");
  if (!result.valid) {
    return { valid: false, reason: `Invalid project name "${name}": ${result.reason}` };
  }
  return { valid: true };
}
