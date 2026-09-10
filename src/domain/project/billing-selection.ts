import { BILLING_PROVIDERS, GLOBAL_BILLING_PROVIDERS } from "./choices.js";
import { deepFreeze } from "./canonical.js";

export const BILLING_SELECTION_POLICY = deepFreeze({
  globalProviders: GLOBAL_BILLING_PROVIDERS,
  maximumGlobalProviders: 1,
  independentProviders: ["chargily", "manual"],
} as const);

export const BILLING_SELECTION_MESSAGE =
  "Select at most one global billing provider (Stripe, Paddle, or Polar). Chargily and manual payments may each be selected alone or combined with that provider.";

/** Shared policy for flags, the wizard, persisted config, and domain resolution. */
export function billingSelectionError(providers: readonly string[]): string | undefined {
  const unsupported = providers.filter(
    (provider) => !(BILLING_PROVIDERS as readonly string[]).includes(provider),
  );
  if (unsupported.length > 0) {
    return `Unsupported billing provider: ${[...new Set(unsupported)].join(", ")}. ${BILLING_SELECTION_MESSAGE}`;
  }
  const selectedGlobals = GLOBAL_BILLING_PROVIDERS.filter((provider) =>
    providers.includes(provider),
  );
  return selectedGlobals.length > 1 ? BILLING_SELECTION_MESSAGE : undefined;
}
