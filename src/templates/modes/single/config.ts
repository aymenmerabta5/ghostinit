import { secret, type TemplateFile } from "../../shared.js";
import {
  filteredEnvExample as unifiedFilteredEnvExample,
  filteredEnvLocal as unifiedFilteredEnvLocal,
} from "../../shared/env.js";
import {
  billingProviders,
  hasAddon,
  type AddonInstallerMap,
  type BillingProviderName,
} from "../../../lib/addons.js";
import type { RootSecrets } from "../../root.js";

export interface SingleSecrets extends RootSecrets {}
export interface SingleContext {
  dryRun?: boolean;
}

/** Self-issued secrets only — see monorepo/utils.ts buildSecrets for the rationale. */
export function buildSecrets(): RootSecrets {
  return {
    authSecret: secret(),
    postgresPassword: secret(),
    notificationTokenEncryptionKey: secret(32),
    eveInternalAuthSecret: secret(32),
  };
}

export function filteredEnvExample(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  includeResend: boolean,
  runtime: string,
  database: "postgres" | "convex" | "none" | string = "postgres",
  audience: import("../../shared/env/core.js").EnvAudience = {
    framework: "nextjs",
    hasMobile: false,
  },
): TemplateFile {
  return unifiedFilteredEnvExample(
    projectName,
    secrets,
    selectedBilling,
    includeResend,
    runtime,
    "single",
    database,
    audience,
  );
}

export function filteredEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  runtime = "bun",
  database: "postgres" | "convex" | "none" | string = "postgres",
  audience: import("../../shared/env/core.js").EnvAudience = {
    framework: "nextjs",
    hasMobile: false,
  },
  includeResend = true,
): TemplateFile {
  return unifiedFilteredEnvLocal(
    projectName,
    secrets,
    selectedBilling,
    runtime,
    "single",
    database,
    audience,
    includeResend,
  );
}

export function selectedBillingFromAddons(
  addons?: AddonInstallerMap | Record<string, { inUse: boolean }>,
): BillingProviderName[] {
  if (!addons) return [];
  const sel: BillingProviderName[] = [];
  for (const p of billingProviders) {
    if (hasAddon(addons as AddonInstallerMap, p)) sel.push(p as BillingProviderName);
  }
  return sel;
}
