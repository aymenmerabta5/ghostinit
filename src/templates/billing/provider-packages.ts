import type { BillingProviderName } from "../../lib/addons.js";
import type * as v from "../versions.js";

export const BILLING_PROVIDER_PACKAGES = {
  stripe: "stripe",
  chargily: "@chargily/chargily-pay",
  paddle: "@paddle/paddle-node-sdk",
  polar: "@polar-sh/sdk",
} as const satisfies Record<BillingProviderName, keyof typeof v.billing>;
