import { jobsServerOnly } from "./shared.js";

export function jobsPortsContent(): string {
  return `${jobsServerOnly}
import type {
  JobDefinition,
  JobPayload,
  JobRun,
  JobRunMutationResult,
  JobSchedule,
} from "./contracts.js";

export interface EnqueueJobRunInput {
  jobId: string;
  scheduleId: string | null;
  requestedByUserId: string | null;
  idempotencyKey: string;
  payload: JobPayload;
  maxAttempts: number;
  availableAt: Date;
  createdAt: Date;
}

export type EnqueueJobRunResult =
  | { kind: "accepted"; run: JobRun; created: boolean }
  | { kind: "conflict" };

export type JobLeaseTransitionResult =
  | { kind: "updated"; run: JobRun }
  | { kind: "cancellation-requested"; run: JobRun }
  | { kind: "cancelled"; run: JobRun }
  | { kind: "lease-lost" };

export type ExpiredLeaseRecovery =
  | { state: "queued"; availableAt: Date; error: string }
  | { state: "failed" | "cancelled"; finishedAt: Date; error: string | null };

export interface JobPersistencePort {
  getDefinition(jobId: string): Promise<JobDefinition | null>;
  getSchedule(scheduleId: string): Promise<JobSchedule | null>;
  listDueSchedules(input: { dueAt: Date; limit: number }): Promise<JobSchedule[]>;
  advanceSchedule(input: {
    scheduleId: string;
    expectedNextRunAt: Date;
    nextRunAt: Date;
    updatedAt: Date;
  }): Promise<boolean>;

  /**
   * Enforce a unique idempotency key and return the existing run only when its
   * immutable job, owner, schedule, payload, and retry fields match. Otherwise
   * return conflict; never acknowledge a different request as a replay.
   */
  enqueueRun(input: EnqueueJobRunInput): Promise<EnqueueJobRunResult>;
  getOwnedRun(input: { runId: string; userId: string }): Promise<JobRun | null>;
  /** Queued runs cancel immediately; running runs record a cooperative cancellation request. */
  requestCancellationOwned(input: {
    runId: string;
    userId: string;
    requestedAt: Date;
  }): Promise<JobRunMutationResult | null>;

  /**
   * Atomically claim one available, non-cancelled queued run and increment its
   * attempt. Exactly one concurrent caller may win.
   */
  claimNextRun(input: {
    workerId: string;
    leaseToken: string;
    claimedAt: Date;
    leaseExpiresAt: Date;
  }): Promise<JobRun | null>;
  /** Return null for an expired lease as well as a token/worker mismatch. */
  getLeasedRun(input: {
    runId: string;
    workerId: string;
    leaseToken: string;
    observedAt: Date;
  }): Promise<JobRun | null>;
  heartbeatRun(input: {
    runId: string;
    workerId: string;
    leaseToken: string;
    heartbeatAt: Date;
    leaseExpiresAt: Date;
  }): Promise<JobLeaseTransitionResult>;
  /** Atomically prefer a persisted cancellation request over successful completion. */
  completeRun(input: {
    runId: string;
    workerId: string;
    leaseToken: string;
    completedAt: Date;
  }): Promise<JobLeaseTransitionResult>;
  /** Queue when retryAt is present, fail otherwise, but cancellation always wins. */
  settleFailedRun(input: {
    runId: string;
    workerId: string;
    leaseToken: string;
    failedAt: Date;
    error: string;
    retryAt: Date | null;
  }): Promise<JobLeaseTransitionResult>;
  acknowledgeCancellation(input: {
    runId: string;
    workerId: string;
    leaseToken: string;
    cancelledAt: Date;
  }): Promise<JobLeaseTransitionResult>;

  listExpiredLeases(input: { expiredAt: Date; limit: number }): Promise<JobRun[]>;
  /**
   * Compare both token and expiry; return null when a heartbeat or peer recovery
   * won. A current persisted cancellation request overrides the proposed recovery.
   */
  recoverExpiredLease(input: {
    runId: string;
    expectedLeaseToken: string;
    expectedLeaseExpiresAt: Date;
    recoveredAt: Date;
    recovery: ExpiredLeaseRecovery;
  }): Promise<JobRun | null>;
}

export interface JobScheduleCalculatorPort {
  nextAfter(schedule: JobSchedule, scheduledFor: Date): Promise<Date> | Date;
}

export interface JobLeaseTokenPort {
  create(): Promise<string> | string;
}
`;
}
