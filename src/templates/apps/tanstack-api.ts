/**
 * TanStack Start API routes — deduplicated via fragments/api
 * Shared webhook logic: raw Buffer Buffer.from(await request.arrayBuffer()), 400 missing 403 invalid 200 ok idempotent onConflictDoNothing
 */

import { file, type TemplateFile } from "../shared.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import { billingProviders } from "../../lib/addons.js";
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
  if (Array.isArray(map)) return map as BillingProviderName[];
  const sel: BillingProviderName[] = [];
  for (const p of billingProviders) {
    if ((map as any)[p]?.inUse) sel.push(p as BillingProviderName);
  }
  if ((map as any).billing?.inUse && sel.length === 0)
    return [...billingProviders] as BillingProviderName[];
  return sel;
}

function shouldEmitProvider(
  provider: BillingProviderName,
  selected: BillingProviderName[],
  addonsPresent: boolean,
  map?: AddonInstallerMap | Record<string, { inUse: boolean }>,
): boolean {
  if (!addonsPresent) return false;
  if (selected.length === 0) {
    const legacy = (map as any)?.billing?.inUse;
    return Boolean(legacy);
  }
  return selected.includes(provider);
}

export function tanstackApiFiles(
  addons?: AddonInstallerMap | BillingProviderName[] | Record<string, { inUse: boolean }>,
): TemplateFile[] {
  const addonsPresent = addons !== undefined;
  const selected = selectedBillingFromAddons(addons as any);
  const include = (p: BillingProviderName) =>
    shouldEmitProvider(p, selected, addonsPresent, addons as any);

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
  return file("apps/web/src/routes/api/auth/$splat.ts", authFileContent("tanstack"));
}

function orpcApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/rpc/$splat.ts", orpcFileContent("tanstack"));
}

function healthApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/health.ts", healthFileContent("tanstack"));
}

function openapiApiRoute(): TemplateFile {
  return file("apps/web/src/routes/api/openapi.ts", openapiFileContent("tanstack"));
}

function stripeWebhookRoute(): TemplateFile {
  return file("apps/web/src/routes/api/webhooks/stripe.ts", stripeWebhookFileContent("tanstack"));
}

function chargilyWebhookRoute(): TemplateFile {
  return file(
    "apps/web/src/routes/api/webhooks/chargily.ts",
    chargilyWebhookFileContent("tanstack"),
  );
}

function paddleWebhookRoute(): TemplateFile {
  return file("apps/web/src/routes/api/webhooks/paddle.ts", paddleWebhookFileContent("tanstack"));
}

function polarWebhookRoute(): TemplateFile {
  return file("apps/web/src/routes/api/webhooks/polar.ts", polarWebhookFileContent("tanstack"));
}
