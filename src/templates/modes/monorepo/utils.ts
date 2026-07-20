import { secret, type TemplateFile } from "../../shared.js";
import { filteredEnvExample as sharedFilteredEnvExample } from "../../shared/billing-env.js";
import type { RootSecrets } from "../../root.js";
import {
  billingProviders,
  hasAddon,
  type BillingProviderName,
  type AddonInstallerMap,
} from "../../../lib/addons.js";

export function buildSecrets(): RootSecrets {
  return {
    authSecret: secret(),
    postgresPassword: secret(),
    resendApiKey: secret(),
    stripeSecretKey: secret(),
    stripeWebhookSecret: secret(),
    stripePublishableKey: "pk_test_" + secret().slice(0, 32),
    chargilyApiKey: secret(),
    chargilySecretKey: secret(),
    paddleApiKey: secret(),
    paddleWebhookSecret: secret(),
    paddleClientToken: "pdl_ntf_" + secret().slice(0, 24),
    polarAccessToken: secret(),
    polarWebhookSecret: secret(),
    polarOrgId: secret(),
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
): TemplateFile {
  return sharedFilteredEnvExample(
    projectName,
    secrets,
    selectedBilling,
    includeResend,
    runtime,
    "monorepo",
  );
}
