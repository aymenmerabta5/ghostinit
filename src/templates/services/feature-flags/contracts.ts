import { featureFlagsServerOnly } from "./shared.js";

export function featureFlagsContractsContent(): string {
  return `${featureFlagsServerOnly}
export type FeatureFlagValue = boolean | number | string;

export interface FeatureFlagSubject {
  kind: "user" | "anonymous";
  key: string;
  attributes: Readonly<Record<string, boolean | number | string>>;
}

export type FeatureFlagEvaluationReason =
  | "targeting-match"
  | "rollout"
  | "provider-default"
  | "disabled";

export interface FeatureFlagEvaluation {
  key: string;
  value: FeatureFlagValue;
  variant: string | null;
  reason: FeatureFlagEvaluationReason;
  version: string | null;
  evaluatedAt: Date;
}

export interface FeatureFlagProviderEvaluation {
  key: string;
  value: FeatureFlagValue;
  variant: string | null;
  reason: FeatureFlagEvaluationReason;
  version: string | null;
}
`;
}
