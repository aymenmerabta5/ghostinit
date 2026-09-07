/**
 * Runtime dependencies pulled into the web app by the billing webhook routes.
 *
 * The webhook handlers live in the app (`apps/web/src/app/api/webhooks/*` for
 * Next.js, `apps/web/src/routes/api/webhooks/*` for TanStack Start), so the app
 * imports each selected provider's SDK — and `eq` from drizzle-orm on the
 * drizzle variants — directly. Those must be declared by the app itself rather
 * than relied upon to hoist out of @repo/billing.
 *
 * Shared by apps/core.ts (Next.js) and apps/tanstack-core.ts so the two cannot
 * drift apart.
 */

import * as v from "../../versions.js";
import { hasAddon, type AddonInstallerMap, type BillingProviderName } from "../../../lib/addons.js";

const PROVIDER_SDK: Record<
  BillingProviderName,
  readonly [packageName: string, version: string, exact: boolean]
> = {
  // Stripe couples its SDK release to one LatestApiVersion type literal.
  stripe: ["stripe", v.billing.stripe, true],
  chargily: ["@chargily/chargily-pay", v.billing["@chargily/chargily-pay"], false],
  paddle: ["@paddle/paddle-node-sdk", v.billing["@paddle/paddle-node-sdk"], false],
  polar: ["@polar-sh/sdk", v.billing["@polar-sh/sdk"], false],
};

export function webhookRuntimeDeps(
  addonMap?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): Record<string, string> {
  if (!addonMap) return {};
  const map = addonMap as AddonInstallerMap;
  const deps: Record<string, string> = {};

  let anyProvider = false;
  for (const provider of Object.keys(PROVIDER_SDK) as BillingProviderName[]) {
    if (!hasAddon(map, provider)) continue;
    const [pkg, version, exact] = PROVIDER_SDK[provider];
    deps[pkg] = exact ? version : `^${version}`;
    if (provider === "paddle") deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
    anyProvider = true;
  }

  if (anyProvider) {
    // Handlers import billing schema/domain helpers from the workspace package.
    deps["@repo/billing"] = "workspace:*";
    // Drizzle-backed handlers import `eq`; the Convex ones do not.
    if (!hasAddon(map, "convex")) {
      deps["drizzle-orm"] = `^${v.database["drizzle-orm"]}`;
    }
  }
  return deps;
}
