import type { ProjectMode } from "../../../lib/addons.js";

export function convexJobsRequestAdapterContent(mode: ProjectMode): string {
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "../../services/jobs";
  return `import "server-only";
import { JobError, type JobActor, type JobPayload, type JobRun } from "${serviceImport}";

interface SerializedRun {
  id: string;
  jobId: string;
  scheduleId: string | null;
  requestedByUserId: string | null;
  idempotencyKey: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  payload: JobPayload;
  attempt: number;
  maxAttempts: number;
  availableAt: number;
  cancellationRequestedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConvexJobsRequestExecutor {
  enqueue(input: { jobKey: string; requestKey: string; payload: JobPayload; maxAttempts?: number }): Promise<{ run: SerializedRun; created: boolean }>;
  get(input: { runId: string }): Promise<SerializedRun | null>;
  cancel(input: { runId: string }): Promise<{ run: SerializedRun; changed: boolean } | null>;
}

function date(value: number | null): Date | null {
  return value === null ? null : new Date(value);
}

function toRun(value: SerializedRun): JobRun {
  return {
    ...value,
    availableAt: new Date(value.availableAt),
    cancellationRequestedAt: date(value.cancellationRequestedAt),
    startedAt: date(value.startedAt),
    finishedAt: date(value.finishedAt),
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
    lease: null,
  };
}

function assertOwned(actor: JobActor, value: SerializedRun | null): SerializedRun {
  if (!value || value.requestedByUserId !== actor.userId) {
    throw new JobError("JOB_RUN_NOT_FOUND", "Job run not found");
  }
  return value;
}

/**
 * Request-scoped Convex adapter. The executor must call the authenticated
 * convex/jobs.ts functions; those functions derive the actor and never accept
 * a caller-supplied user ID.
 */
export function createConvexJobsRequestAdapter(executor: ConvexJobsRequestExecutor) {
  return {
    runs: {
      async enqueue(actor: JobActor, input: { jobId: string; requestKey: string; payload?: JobPayload; maxAttempts?: number }) {
        const result = await executor.enqueue({
          jobKey: input.jobId,
          requestKey: input.requestKey,
          payload: input.payload ?? {},
          ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
        });
        return { run: toRun(assertOwned(actor, result.run)), created: result.created };
      },
      async get(actor: JobActor, runId: string) {
        return toRun(assertOwned(actor, await executor.get({ runId })));
      },
      async cancel(actor: JobActor, runId: string) {
        const result = await executor.cancel({ runId });
        if (!result) throw new JobError("JOB_RUN_NOT_FOUND", "Job run not found");
        return { run: toRun(assertOwned(actor, result.run)), changed: result.changed };
      },
    },
  };
}

export type ConvexJobsRequestAdapter = ReturnType<typeof createConvexJobsRequestAdapter>;
`;
}
