import { featureFlagsServerOnly } from "./shared.js";

export function featureFlagsPortsContent(): string {
  return `${featureFlagsServerOnly}
import type { FeatureFlagProviderEvaluation, FeatureFlagSubject } from "./contracts.js";

/**
 * Provider-neutral remote evaluation boundary. Concrete SDKs belong only in a
 * composition adapter. The provider must not silently omit unavailable flags.
 */
export interface RemoteFeatureFlagPort {
  evaluateMany(input: {
    subject: FeatureFlagSubject;
    keys: readonly string[];
  }): Promise<readonly FeatureFlagProviderEvaluation[]>;
}
`;
}
