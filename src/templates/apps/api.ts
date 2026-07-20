/**
 * oRPC contract-first, webhooks via Next.js Route Handlers raw Buffer
 * Deduplicated via fragments/api – Buffer.from(await request.arrayBuffer()) NOT req.json() stripe-signature 400 403 etc shared
 */

import { file, type TemplateFile } from "../shared.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import { billingProviders, hasAddon } from "../../lib/addons.js";
import {
  authFileContent,
  orpcFileContent,
  healthFileContent,
  openapiFileContent,
  stripeWebhookFileContent,
  chargilyWebhookFileContent,
  paddleWebhookFileContent,
  polarWebhookFileContent,
} from "./fragments/api.js";

function selectedBillingFromAddons(
  map?: AddonInstallerMap | Record<string, { inUse: boolean }> | BillingProviderName[],
): BillingProviderName[] {
  if (!map) return [];
  if (Array.isArray(map)) {
    return map as BillingProviderName[];
  }
  const sel: BillingProviderName[] = [];
  for (const p of billingProviders) {
    if (hasAddon(map as AddonInstallerMap, p)) sel.push(p as BillingProviderName);
  }
  if (hasAddon(map as AddonInstallerMap | undefined, "billing") && sel.length === 0) {
    return [...billingProviders] as BillingProviderName[];
  }
  return sel;
}

function shouldEmitProvider(
  provider: BillingProviderName,
  selected: BillingProviderName[],
  addonsPresent: boolean,
  map?: AddonInstallerMap | Record<string, { inUse: boolean }>,
): boolean {
  if (!addonsPresent) {
    return false;
  }
  if (selected.length === 0) {
    const legacy = hasAddon(map as AddonInstallerMap, "billing");
    return Boolean(legacy);
  }
  return selected.includes(provider);
}

export function apiFiles(
  addons?: AddonInstallerMap | BillingProviderName[] | Record<string, { inUse: boolean }>,
): TemplateFile[] {
  const addonsPresent = addons !== undefined;
  const selected = selectedBillingFromAddons(
    addons as AddonInstallerMap | Record<string, { inUse: boolean }> | BillingProviderName[],
  );
  const include = (p: BillingProviderName) =>
    shouldEmitProvider(
      p,
      selected,
      addonsPresent,
      addons as AddonInstallerMap | Record<string, { inUse: boolean }>,
    );

  const base: TemplateFile[] = [
    authApiRoute(),
    orpcApiRoute(),
    healthApiRoute(),
    openapiApiRoute(),
  ];

  if (include("stripe")) base.push(stripeWebhookRoute());
  if (include("chargily")) base.push(chargilyWebhookRoute());
  if (include("paddle")) base.push(paddleWebhookRoute());
  if (include("polar")) base.push(polarWebhookRoute());

  return base;
}

function authApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/auth/[...all]/route.ts", authFileContent("next"));
}

function orpcApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/[...path]/route.ts", orpcFileContent("next"));
}

function healthApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/health/route.ts", healthFileContent("next"));
}

function openapiApiRoute(): TemplateFile {
  return file("apps/web/src/app/api/openapi/route.ts", openapiFileContent("next"));
}

function stripeWebhookRoute(): TemplateFile {
  return file("apps/web/src/app/api/webhooks/stripe/route.ts", stripeWebhookFileContent("next"));
}

function chargilyWebhookRoute(): TemplateFile {
  return file(
    "apps/web/src/app/api/webhooks/chargily/route.ts",
    chargilyWebhookFileContent("next"),
  );
}

function paddleWebhookRoute(): TemplateFile {
  return file("apps/web/src/app/api/webhooks/paddle/route.ts", paddleWebhookFileContent("next"));
}

function polarWebhookRoute(): TemplateFile {
  return file("apps/web/src/app/api/webhooks/polar/route.ts", polarWebhookFileContent("next"));
}
