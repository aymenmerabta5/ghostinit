import { featureFlagsServerOnly } from "./shared.js";

export function featureFlagsErrorsContent(): string {
  return `${featureFlagsServerOnly}
export const FEATURE_FLAG_ERROR_CODES = [
  "FEATURE_FLAG_SUBJECT_REQUIRED",
  "FEATURE_FLAG_INVALID_KEY",
  "FEATURE_FLAG_STATIC_CONFIG_FORBIDDEN",
  "FEATURE_FLAG_NOT_FOUND",
  "FEATURE_FLAG_PROVIDER_UNAVAILABLE",
  "FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION",
] as const;
export type FeatureFlagErrorCode = (typeof FEATURE_FLAG_ERROR_CODES)[number];

export class FeatureFlagError<TCode extends FeatureFlagErrorCode = FeatureFlagErrorCode> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "FeatureFlagError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function isFeatureFlagError(error: unknown): error is FeatureFlagError {
  return error instanceof FeatureFlagError;
}
`;
}
