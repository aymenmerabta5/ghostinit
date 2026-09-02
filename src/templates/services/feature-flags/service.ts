import { featureFlagsServerOnly } from "./shared.js";

export function featureFlagsServiceContent(): string {
  return `${featureFlagsServerOnly}
import { FeatureFlagError, isFeatureFlagError } from "./errors.js";
import { assertFeatureFlagSubject, normalizeRemoteFeatureFlagKey } from "./policy.js";
import type { FeatureFlagEvaluation, FeatureFlagSubject } from "./contracts.js";
import type { RemoteFeatureFlagPort } from "./ports.js";

export interface FeatureFlagServiceDependencies {
  provider: RemoteFeatureFlagPort;
  now?: () => Date;
}

export function createFeatureFlagService({ provider, now = () => new Date() }: FeatureFlagServiceDependencies) {
  async function evaluateMany(subject: FeatureFlagSubject, requestedKeys: readonly string[]): Promise<FeatureFlagEvaluation[]> {
    assertFeatureFlagSubject(subject);
    const keys = [...new Set(requestedKeys.map(normalizeRemoteFeatureFlagKey))];
    if (keys.length === 0 || keys.length > 50) {
      throw new FeatureFlagError("FEATURE_FLAG_INVALID_KEY", "Request between one and fifty remote flags");
    }

    let values: Awaited<ReturnType<RemoteFeatureFlagPort["evaluateMany"]>>;
    try {
      values = await provider.evaluateMany({ subject, keys });
    } catch (error) {
      if (isFeatureFlagError(error)) throw error;
      throw new FeatureFlagError(
        "FEATURE_FLAG_PROVIDER_UNAVAILABLE",
        "Remote feature flags are unavailable",
        { cause: error },
      );
    }

    const byKey = new Map(values.map((value) => [value.key, value]));
    if (byKey.size !== values.length || values.some((value) => !keys.includes(value.key))) {
      throw new FeatureFlagError(
        "FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION",
        "The remote flag provider returned an invalid response",
      );
    }
    const missing = keys.find((key) => !byKey.has(key));
    if (missing) {
      throw new FeatureFlagError("FEATURE_FLAG_NOT_FOUND", "Remote feature flag not found");
    }

    const evaluatedAt = now();
    return keys.map((key) => {
      const value = byKey.get(key);
      if (!value) {
        throw new FeatureFlagError("FEATURE_FLAG_NOT_FOUND", "Remote feature flag not found");
      }
      return { ...value, evaluatedAt };
    });
  }

  return {
    evaluateMany,
    async evaluate(subject: FeatureFlagSubject, key: string): Promise<FeatureFlagEvaluation> {
      return (await evaluateMany(subject, [key]))[0]!;
    },
  };
}

export type FeatureFlagService = ReturnType<typeof createFeatureFlagService>;
`;
}
