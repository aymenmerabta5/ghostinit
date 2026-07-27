/**
 * Feature-flag resolution shared by the app composers.
 *
 * Callers pass either a plain boolean (legacy `hasEve` argument) or an addon map
 * (`{ eve: { inUse: true } }`). This was duplicated verbatim in core.ts,
 * tanstack-core.ts and expo-core.ts; pages.ts had no resolver at all, which is
 * why the eve agent page shipped into projects that never enabled eve.
 */

import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";

export type FeatureInput =
  | boolean
  | AddonInstallerMap
  | Record<string, { inUse: boolean }>
  | BillingProviderName[];

type InUseRecord = Record<string, { inUse?: boolean }>;

export function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  if (Array.isArray(input)) return false;
  const record = input as InUseRecord;
  return Boolean(record[feature]?.inUse);
}

export function resolveHasEve(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "eve");
}

export function resolveHasI18n(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "i18n");
}
