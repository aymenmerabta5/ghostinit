import { featureFlagsServerOnly } from "./shared.js";

export function featureFlagsAdapterContractContent(): string {
  return `${featureFlagsServerOnly}
import type { RemoteFeatureFlagPort } from "./ports.js";

/** Structural adapter keeps vendor SDK imports out of the application service. */
export interface RemoteFeatureFlagAdapter extends RemoteFeatureFlagPort {
  readonly kind: string;
}

export function defineRemoteFeatureFlagAdapter<T extends RemoteFeatureFlagAdapter>(adapter: T): T {
  return adapter;
}
`;
}
