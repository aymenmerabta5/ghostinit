import type { OnlineBillingProvider } from "../../domain/project/choices.js";
import type * as v from "../versions.js";

export const BILLING_PROVIDER_PACKAGES = {
  stripe: "stripe",
  chargily: "@chargily/chargily-pay",
  paddle: "@paddle/paddle-node-sdk",
  polar: "@polar-sh/sdk",
} as const satisfies Record<OnlineBillingProvider, keyof typeof v.billing>;
