import type { ProjectMode } from "../../../lib/addons.js";

export function postgresJobsMappersContent(mode: ProjectMode): string {
  const databaseImport =
    mode === "monorepo"
      ? `import { jobDefinitions, jobRuns, jobSchedules } from "@repo/database";`
      : `import { jobDefinitions, jobRuns, jobSchedules } from "../../db/schema/jobs";`;
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "../../services/jobs";
  return `import "server-only";
${databaseImport}
import type { JobDefinition, JobPayload, JobRun, JobSchedule } from "${serviceImport}";

export type JobDefinitionRow = typeof jobDefinitions.$inferSelect;
export type JobScheduleRow = typeof jobSchedules.$inferSelect;
export type JobRunRow = typeof jobRuns.$inferSelect;

function payload(value: unknown): JobPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored job payload is not an object");
  }
  return Object.fromEntries(Object.entries(value));
}

export function toJobDefinition(row: JobDefinitionRow): JobDefinition {
  return {
    id: row.id,
    type: row.type,
    enabled: row.enabled,
    defaultMaxAttempts: row.defaultMaxAttempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toJobSchedule(row: JobScheduleRow): JobSchedule {
  return {
    id: row.id,
    jobId: row.jobId,
    expression: row.expression,
    timezone: row.timezone,
    enabled: row.enabled,
    payload: payload(row.payload),
    maxAttempts: row.maxAttempts,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toJobRun(row: JobRunRow): JobRun {
  const lease =
    row.leaseWorkerId && row.leaseToken && row.leaseAcquiredAt && row.leaseHeartbeatAt && row.leaseExpiresAt
      ? {
          workerId: row.leaseWorkerId,
          token: row.leaseToken,
          acquiredAt: row.leaseAcquiredAt,
          heartbeatAt: row.leaseHeartbeatAt,
          expiresAt: row.leaseExpiresAt,
        }
      : null;
  return {
    id: row.id,
    jobId: row.jobId,
    scheduleId: row.scheduleId,
    requestedByUserId: row.requestedByUserId,
    idempotencyKey: row.idempotencyKey,
    state: row.state,
    payload: payload(row.payload),
    attempt: row.attempt,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt,
    lease,
    cancellationRequestedAt: row.cancellationRequestedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
}

export function sameJobPayload(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
`;
}
