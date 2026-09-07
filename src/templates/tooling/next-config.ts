import { BILLING_PROVIDERS, type BillingProviderName } from "../../lib/addons.js";
import { BILLING_PROVIDER_PACKAGES } from "../billing/provider-packages.js";

export interface NextConfigOptions {
  readonly hasEve?: boolean;
  readonly hasI18n?: boolean;
  readonly hasPdf?: boolean;
  readonly hasCloudflare?: boolean;
  readonly hasConvex?: boolean;
  readonly billingProviders?: readonly BillingProviderName[];
}

export function nextServerExternalPackagesBlock(
  providers: readonly BillingProviderName[],
  hasCloudflare = false,
): string {
  if (hasCloudflare || providers.length === 0) return "";
  const packages = BILLING_PROVIDERS.filter((provider) => providers.includes(provider)).map(
    (provider) => BILLING_PROVIDER_PACKAGES[provider],
  );
  return `  // Native SDK loading avoids compiling large provider graphs on unrelated routes.
  serverExternalPackages: ${JSON.stringify(packages)},`;
}
