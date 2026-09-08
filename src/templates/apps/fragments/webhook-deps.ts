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
import { BILLING_PROVIDERS, hasAddon, type AddonInstallerMap } from "../../../lib/addons.js";
import { BILLING_PROVIDER_PACKAGES } from "../../billing/provider-packages.js";

export function webhookRuntimeDeps(
  addonMap?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): Record<string, string> {
  if (!addonMap) return {};
  const map = addonMap as AddonInstallerMap;
  const deps: Record<string, string> = {};

  let anyProvider = false;
  for (const provider of BILLING_PROVIDERS) {
    if (!hasAddon(map, provider)) continue;
    const pkg = BILLING_PROVIDER_PACKAGES[provider];
    const version = v.billing[pkg];
    // Stripe couples its SDK release to one LatestApiVersion type literal.
    deps[pkg] = provider === "stripe" ? version : `^${version}`;
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
