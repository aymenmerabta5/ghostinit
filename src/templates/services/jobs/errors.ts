import { jobsServerOnly } from "./shared.js";

export function jobsErrorsContent(): string {
  return `${jobsServerOnly}
export const JOB_ERROR_CODES = [
  "JOB_UNAUTHENTICATED",
  "JOB_WORKER_REQUIRED",
  "JOB_DEFINITION_NOT_FOUND",
  "JOB_DEFINITION_DISABLED",
  "JOB_SCHEDULE_NOT_FOUND",
  "JOB_SCHEDULE_DISABLED",
  "JOB_RUN_NOT_FOUND",
  "JOB_INVALID_IDEMPOTENCY_KEY",
  "JOB_IDEMPOTENCY_CONFLICT",
  "JOB_INVALID_RETRY_POLICY",
  "JOB_SCHEDULE_CALCULATION_FAILED",
  "JOB_INVALID_SCHEDULE_ADVANCE",
  "JOB_LEASE_TOKEN_UNAVAILABLE",
  "JOB_LEASE_LOST",
  "JOB_CANCEL_REQUESTED",
  "JOB_PERSISTENCE_FAILED",
] as const;
export type JobErrorCode = (typeof JOB_ERROR_CODES)[number];

export class JobError<TCode extends JobErrorCode = JobErrorCode> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "JobError";
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function isJobError(error: unknown): error is JobError {
  return error instanceof JobError;
}
`;
}
