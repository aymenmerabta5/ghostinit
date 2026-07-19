/**
 * Webhook providers factory — composes webhook route content from provider fragments.
 *
 * SSOT: BillingProviderName and BILLING_PROVIDER_NAMES derived from
 * providers/interface/types.ts (template) which mirrors BILLING_PROVIDERS
 * from src/lib/constants.ts (CLI). Adding 5th provider:
 *   - add folder src/templates/billing/providers/<name>/ with core files
 *   - update BILLING_PROVIDER_NAMES in providers/interface/types.ts
 *   - add src/templates/billing/webhooks/<name>.ts or providers/<name>.ts
 *   - register in contentFor switch + contentMap if needed
 *   - loop registry in allWebhookFiles already uses SSOT
 *   - tests/unit/billing-barrel.test.ts validates fs matches SSOT
 *
 * Codegen note: shared/env/billing.ts billingEnvLines() loops over BILLING_PROVIDERS
 * for env vars — same loop pattern could generate webhook barrel, but test safety-net
 * is sufficient vs full codegen.
 */

import { file, type TemplateFile } from "../../../shared.js";
import { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";
import {
  getDbImports,
  getPath,
  type WebhookFramework,
  type WebhookMode,
  type DbImports,
  type BillingProviderName,
} from "./shared.js";
import { stripeNextContent, stripeTanstackContent } from "./stripe.js";
import { chargilyNextContent, chargilyTanstackContent } from "./chargily.js";
import { paddleNextContent, paddleTanstackContent } from "./paddle.js";
import { polarNextContent, polarTanstackContent } from "./polar.js";

// Registry of framework-pair contents — explicit map keyed by provider.
// For a new provider, add here + add files in ./<name>.ts or ./polar.ts shim style.
// Could be loop-generated, but explicit switch keeps <300 and type-safe.
type ContentGenerators = {
  next: (imp: DbImports) => string;
  tanstack: (imp: DbImports) => string;
};

const providerContentMap: Record<BillingProviderName, ContentGenerators | undefined> = {
  stripe: { next: stripeNextContent, tanstack: stripeTanstackContent },
  chargily: { next: chargilyNextContent, tanstack: chargilyTanstackContent },
  paddle: { next: paddleNextContent, tanstack: paddleTanstackContent },
  polar: { next: polarNextContent, tanstack: polarTanstackContent },
} as Record<BillingProviderName, ContentGenerators | undefined>;

function contentFor(
  provider: BillingProviderName,
  framework: WebhookFramework,
  imp: DbImports,
): string {
  const isTanstack = framework === "tanstack";
  const entry = providerContentMap[provider];
  if (!entry) return "";
  return isTanstack ? entry.tanstack(imp) : entry.next(imp);
}

export function webhookContent(
  provider: BillingProviderName,
  framework: WebhookFramework,
  mode: WebhookMode = "monorepo",
): TemplateFile {
  const effectiveMode: WebhookMode = framework === "single" ? "single" : mode;
  const effectiveFramework: WebhookFramework = framework === "single" ? "next" : framework;
  const isMonorepo = effectiveMode === "monorepo";
  const imp = getDbImports(isMonorepo);
  const path = getPath(provider, effectiveFramework, effectiveMode);
  const content = contentFor(provider, effectiveFramework, imp);
  return file(path, content);
}

export function webhookFilesForProvider(
  provider: BillingProviderName,
  mode: WebhookMode = "monorepo",
  frameworks: WebhookFramework[] = ["next", "tanstack"],
): TemplateFile[] {
  return frameworks.map((fw) => webhookContent(provider, fw, mode));
}

export function allWebhookFiles(
  mode: WebhookMode = "monorepo",
  frameworks: WebhookFramework[] = ["next", "tanstack"],
): TemplateFile[] {
  // SSOT loop — mirrors billing/index.ts loadBillingRegistry pattern
  const providers: BillingProviderName[] = [...BILLING_PROVIDER_NAMES] as BillingProviderName[];
  const out: TemplateFile[] = [];
  for (const p of providers) {
    for (const fw of frameworks) {
      out.push(webhookContent(p, fw, mode));
    }
  }
  return out;
}

export function webhookFilesFiltered(
  selected: BillingProviderName[],
  mode: WebhookMode,
  framework: WebhookFramework,
): TemplateFile[] {
  return selected.map((p) => webhookContent(p, framework, mode));
}

export type { BillingProviderName, WebhookFramework, WebhookMode } from "./shared.js";
export { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";
