import { secret, type TemplateFile } from "../../shared.js";
import {
  filteredEnvExample as sharedFilteredEnvExample,
  filteredEnvLocal as sharedFilteredEnvLocal,
} from "../../shared/billing-env.js";
import type { RootSecrets } from "../../root.js";
import {
  billingProviders,
  hasAddon,
  type BillingProviderName,
  type AddonInstallerMap,
} from "../../../lib/addons.js";

/**
 * Mint only SELF-ISSUED secrets.
 *
 * Third-party credentials (Stripe/Chargily/Paddle/Polar keys, Resend API key)
 * are issued by the vendor and are intentionally omitted so the env writer emits
 * REPLACE_WITH_* placeholders. A generated value looks configured but isn't: it
 * satisfies every webhook's `secret.startsWith("REPLACE_WITH")` guard, so the
 * clear 400 "not configured" path never fires and the user instead debugs an
 * opaque 403 signature failure (and the Stripe SDK throws on a key with no
 * `sk_` prefix).
 */
export function buildSecrets(): RootSecrets {
  return {
    authSecret: secret(),
    postgresPassword: secret(),
    notificationTokenEncryptionKey: secret(32),
    eveInternalAuthSecret: secret(32),
  };
}

export function selectedBillingFromAddons(
  addons?: Record<string, { inUse: boolean }> | AddonInstallerMap,
): BillingProviderName[] {
  if (!addons) return [];
  const sel: BillingProviderName[] = [];
  for (const p of billingProviders) {
    if (hasAddon(addons as AddonInstallerMap, p)) sel.push(p as BillingProviderName);
  }
  return sel;
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
  return sharedFilteredEnvExample(
    projectName,
    secrets,
    selectedBilling,
    includeResend,
    runtime,
    "monorepo",
    database,
    audience,
  );
}

export function filteredEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  runtime: string,
  database: "postgres" | "convex" | "none" | string = "postgres",
  audience: import("../../shared/env/core.js").EnvAudience = {
    framework: "nextjs",
    hasMobile: false,
  },
  includeResend = true,
): TemplateFile {
  return sharedFilteredEnvLocal(
    projectName,
    secrets,
    selectedBilling,
    runtime,
    "monorepo",
    database,
    audience,
    includeResend,
  );
}
