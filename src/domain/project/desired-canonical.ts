import type { DesiredProjectConfig } from "./config.js";
import { normalizeDependencySecurityResolutions } from "../dependency-security/resolutions.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonicalize only order-insensitive desired-state collections. */
export function canonicalDesiredProjectConfig(desired: DesiredProjectConfig): DesiredProjectConfig {
  const billing = desired.capabilities.billing;
  const capabilities = { ...desired.capabilities };
  for (const key of Object.keys(capabilities) as (keyof typeof capabilities)[]) {
    if (capabilities[key] === undefined) delete capabilities[key];
  }
  if (billing !== undefined && billing !== false) {
    capabilities.billing = { providers: [...new Set(billing.providers)].sort(compareText) };
  }
  const normalized = {
    ...desired,
    ...(desired.dependencySecurity === undefined
      ? {}
      : { dependencySecurity: normalizeDependencySecurityResolutions(desired.dependencySecurity) }),
    apps: [...desired.apps].sort(
      (left, right) =>
        compareText(left.id, right.id) ||
        compareText(left.target, right.target) ||
        compareText(left.deploy, right.deploy),
    ),
    capabilities,
  };
  if (normalized.runtime === undefined) delete normalized.runtime;
  if (normalized.dependencySecurity === undefined) delete normalized.dependencySecurity;
  return normalized;
}
