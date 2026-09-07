import { featureFlagsServerOnly } from "./shared.js";

export function featureFlagsPolicyContent(): string {
  return `${featureFlagsServerOnly}
import { FeatureFlagError } from "./errors.js";
import type { FeatureFlagSubject } from "./contracts.js";

/**
 * Remote flags are rollout hints, never authorization, entitlement, secret,
 * or invariant checks. Enforce permissions in domain/application policies.
 */
export const FEATURE_FLAGS_ARE_NOT_AUTHORIZATION = true as const;

export function assertFeatureFlagSubject(subject: FeatureFlagSubject): void {
  if (!subject.key.trim()) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "A stable evaluation subject is required");
  }
}

export function normalizeRemoteFeatureFlagKey(input: string): string {
  const key = input.trim();
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(key)) {
    throw new FeatureFlagError("FEATURE_FLAG_INVALID_KEY", "The remote flag key is invalid");
  }
  const lower = key.toLocaleLowerCase("en-US");
  if (lower === "config" || lower.startsWith("config.") || lower === "env" || lower.startsWith("env.")) {
    throw new FeatureFlagError(
      "FEATURE_FLAG_STATIC_CONFIG_FORBIDDEN",
      "Static configuration must come from the typed config package, not remote flags",
    );
  }
  return key;
}
`;
}
