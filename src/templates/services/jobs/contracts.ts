import { jobsServerOnly } from "./shared.js";

export function jobsContractsContent(): string {
  return `${jobsServerOnly}
export type JobPayload = Readonly<Record<string, unknown>>;

export interface JobActor {
  userId: string;
}

export interface JobWorker {
  workerId: string;
}

export interface JobDefinition {
  id: string;
  type: string;
  enabled: boolean;
  defaultMaxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobSchedule {
  id: string;
  jobId: string;
  expression: string;
  timezone: string;
  enabled: boolean;
  payload: JobPayload;
  maxAttempts: number;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const JOB_RUN_STATES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type JobRunState = (typeof JOB_RUN_STATES)[number];

export interface JobLease {
  workerId: string;
  token: string;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
}

export interface JobRun {
  id: string;
  jobId: string;
  scheduleId: string | null;
  requestedByUserId: string | null;
  idempotencyKey: string;
  state: JobRunState;
  payload: JobPayload;
  attempt: number;
  maxAttempts: number;
  availableAt: Date;
  lease: JobLease | null;
  cancellationRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRetryPolicy {
  initialDelayMs: number;
  multiplier: number;
  maximumDelayMs: number;
}

export interface JobRunMutationResult {
  run: JobRun;
  changed: boolean;
}
`;
}
