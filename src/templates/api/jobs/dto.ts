import type { ProjectMode } from "../../../lib/addons.js";
import { jobsServiceModule } from "./shared.js";

export function jobsDtoContent(mode: ProjectMode): string {
  const serviceModule = jobsServiceModule(mode);
  return `import type { JobRun } from "${serviceModule}";

/** Lease tokens, worker IDs, and internal error details never cross the public transport. */
export function toJobRunDto(value: JobRun) {
  return {
    id: value.id,
    jobId: value.jobId,
    scheduleId: value.scheduleId,
    idempotencyKey: value.idempotencyKey,
    state: value.state,
    payload: value.payload,
    attempt: value.attempt,
    maxAttempts: value.maxAttempts,
    availableAt: value.availableAt.toISOString(),
    cancellationRequestedAt: value.cancellationRequestedAt?.toISOString() ?? null,
    startedAt: value.startedAt?.toISOString() ?? null,
    finishedAt: value.finishedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
`;
}
