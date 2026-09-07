import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../lib/constants.js";

export type DesktopMode = "monorepo" | "single";

export interface DesktopCapabilities {
  hasApi: boolean;
  hasAuth: boolean;
  hasBilling: boolean;
  hasEmail: boolean;
  hasAdmin: boolean;
  hasAnalytics: boolean;
  hasEve: boolean;
  hasI18n: boolean;
  hasNotifications: boolean;
  hasMessaging: boolean;
  hasStorage: boolean;
  hasFeatureFlags: boolean;
  hasJobs: boolean;
  hasPdf: boolean;
  isConvex: boolean;
}

export const fullDesktopCapabilities: DesktopCapabilities = {
  hasApi: true,
  hasAuth: true,
  hasBilling: true,
  hasEmail: true,
  hasAdmin: true,
  hasAnalytics: false,
  hasEve: false,
  hasI18n: false,
  hasNotifications: false,
  hasMessaging: false,
  hasStorage: false,
  hasFeatureFlags: false,
  hasJobs: false,
  hasPdf: false,
  isConvex: false,
};

export function hasDesktopFeature(addons: AddonInstallerMap | undefined, key: string): boolean {
  if (!addons) return false;
  return Boolean((addons as Record<string, { inUse?: boolean }>)[key]?.inUse);
}

export function resolveDesktopBillingProviders(
  addons?: AddonInstallerMap,
  selectedBilling: readonly BillingProviderName[] = [],
): BillingProviderName[] {
  if (selectedBilling.length > 0) return [...new Set(selectedBilling)];
  const selected = BILLING_PROVIDERS.filter((provider) => hasDesktopFeature(addons, provider));
  return selected.length > 0 || !hasDesktopFeature(addons, "billing")
    ? selected
    : [...BILLING_PROVIDERS];
}

export function resolveDesktopCapabilities(
  addons?: AddonInstallerMap,
  selectedBilling: readonly BillingProviderName[] = [],
  allowTanstackEve = false,
): DesktopCapabilities {
  const hasBilling = resolveDesktopBillingProviders(addons, selectedBilling).length > 0;
  const hasApi = hasDesktopFeature(addons, "api") || hasBilling;
  const hasAuth = hasDesktopFeature(addons, "auth") || hasBilling;
  const isConvex = hasDesktopFeature(addons, "convex");
  const hasEve =
    hasDesktopFeature(addons, "eve") &&
    hasApi &&
    hasAuth &&
    (allowTanstackEve || !hasDesktopFeature(addons, "tanstack-start")) &&
    !hasDesktopFeature(addons, "database:none");

  return {
    hasApi,
    hasAuth,
    hasBilling,
    hasEmail: hasDesktopFeature(addons, "email"),
    // Every administrative read and mutation crosses the audited typed API.
    // Auth without transport must never expose a parallel Better Auth surface.
    hasAdmin: hasAuth && hasApi,
    hasAnalytics: hasDesktopFeature(addons, "analytics"),
    hasEve,
    hasI18n: hasDesktopFeature(addons, "i18n"),
    hasNotifications: hasDesktopFeature(addons, "notifications"),
    hasMessaging: hasDesktopFeature(addons, "messaging"),
    hasStorage: hasDesktopFeature(addons, "storage"),
    hasFeatureFlags:
      hasDesktopFeature(addons, "featureFlags") || hasDesktopFeature(addons, "posthog"),
    hasJobs: hasDesktopFeature(addons, "jobsApi"),
    hasPdf: hasDesktopFeature(addons, "pdf"),
    isConvex,
  };
}
