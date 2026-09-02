import { jobsServerOnly } from "./shared.js";

export function jobsPolicyContent(): string {
  return `${jobsServerOnly}
import { JobError } from "./errors.js";
import type { JobActor, JobRetryPolicy, JobWorker } from "./contracts.js";

export const DEFAULT_JOB_RETRY_POLICY: JobRetryPolicy = {
  initialDelayMs: 1_000,
  multiplier: 2,
  maximumDelayMs: 15 * 60 * 1_000,
};

export function assertJobActor(actor: JobActor): void {
  if (!actor.userId.trim()) throw new JobError("JOB_UNAUTHENTICATED", "Authentication is required");
}

export function assertJobWorker(worker: JobWorker): void {
  if (!worker.workerId.trim()) throw new JobError("JOB_WORKER_REQUIRED", "A worker identity is required");
}

function canonicalPart(value: string): string {
  return encodeURIComponent(value.normalize("NFKC"));
}

export function createManualRunIdempotencyKey(jobId: string, userId: string, requestKey: string): string {
  const key = requestKey.trim();
  if (!key || key.length > 200) {
    throw new JobError("JOB_INVALID_IDEMPOTENCY_KEY", "An idempotency request key of at most 200 characters is required");
  }
  return ["job", "v1", "manual", canonicalPart(jobId), canonicalPart(userId), canonicalPart(key)].join(":");
}

export function createScheduledRunIdempotencyKey(
  jobId: string,
  scheduleId: string,
  scheduledFor: Date,
): string {
  if (!Number.isFinite(scheduledFor.getTime())) {
    throw new JobError("JOB_INVALID_IDEMPOTENCY_KEY", "The scheduled instant is invalid");
  }
  return [
    "job",
    "v1",
    "scheduled",
    canonicalPart(jobId),
    canonicalPart(scheduleId),
    scheduledFor.toISOString(),
  ].join(":");
}

export function calculateJobRetryDelayMs(attempt: number, policy: JobRetryPolicy): number {
  if (
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    !Number.isFinite(policy.initialDelayMs) ||
    policy.initialDelayMs < 0 ||
    !Number.isFinite(policy.multiplier) ||
    policy.multiplier < 1 ||
    !Number.isFinite(policy.maximumDelayMs) ||
    policy.maximumDelayMs < policy.initialDelayMs
  ) {
    throw new JobError("JOB_INVALID_RETRY_POLICY", "The retry policy is invalid");
  }
  return Math.min(
    policy.maximumDelayMs,
    Math.round(policy.initialDelayMs * policy.multiplier ** (attempt - 1)),
  );
}
`;
}
