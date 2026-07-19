import type { ProjectMode } from "../../../../lib/addons.js";
import type { AddonInstallerMap } from "../../../../lib/addons.js";
import { BILLING_PROVIDERS as allBillingProviders } from "../../../../lib/constants.js";

type Runtime = "node" | "bun";

function isProjectMode(v: unknown): v is ProjectMode {
  return v === "monorepo" || v === "single";
}

export function normalize(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): { mode: ProjectMode; addons: AddonInstallerMap | undefined } {
  let mode: ProjectMode = "monorepo";
  let addons: AddonInstallerMap | undefined;
  if (typeof modeOrOpts === "string" && isProjectMode(modeOrOpts)) mode = modeOrOpts;
  else if (modeOrOpts && typeof modeOrOpts === "object") {
    const obj = modeOrOpts as Record<string, unknown>;
    if (isProjectMode(obj.mode)) mode = obj.mode as ProjectMode;
    if (obj.addons && typeof obj.addons === "object") addons = obj.addons as AddonInstallerMap;
    if (obj.addonRegistry && typeof obj.addonRegistry === "object")
      addons = obj.addonRegistry as AddonInstallerMap;
  }
  if (runtimeOrAddons && typeof runtimeOrAddons === "object" && !Array.isArray(runtimeOrAddons)) {
    const maybe = runtimeOrAddons as Record<string, unknown>;
    if (maybe.stripe || maybe.chargily || maybe.paddle || maybe.polar || maybe.billing)
      addons = runtimeOrAddons as AddonInstallerMap;
  }
  if (maybeAddons && typeof maybeAddons === "object") addons = maybeAddons as AddonInstallerMap;
  return { mode, addons };
}

export function selectedProviders(addons?: AddonInstallerMap): string[] {
  if (!addons || Object.keys(addons).length === 0) return [...allBillingProviders];
  const sel: string[] = [];
  let anyProviderKeyPresent = false;
  for (const p of allBillingProviders) {
    if (p in (addons as Record<string, unknown>)) anyProviderKeyPresent = true;
    if ((addons as Record<string, { inUse: boolean }>)[p]?.inUse) sel.push(p);
  }
  const legacyBilling = (addons as Record<string, { inUse: boolean }>)["billing"]?.inUse;
  if (sel.length === 0 && legacyBilling) return [...allBillingProviders];
  if (sel.length === 0 && anyProviderKeyPresent) return [];
  return sel;
}

export type { Runtime };
export { allBillingProviders };
