import type { ProjectMode } from "../../../lib/addons.js";
import { jobsServiceModule } from "./shared.js";

export function jobsActionsContent(mode: ProjectMode): string {
  const serviceModule = jobsServiceModule(mode);
  return `import type { JobPayload } from "${serviceModule}";
import { createServiceORPCError } from "../utils/service-error.js";
import { requireJobActor, type JobsTransportContext, type ResolveJobsService } from "./context.js";
import { toJobRunDto } from "./dto.js";

const jobErrorCodeMap = {
  JOB_UNAUTHENTICATED: "UNAUTHORIZED",
  JOB_WORKER_REQUIRED: "INTERNAL_SERVER_ERROR",
  JOB_DEFINITION_NOT_FOUND: "NOT_FOUND",
  JOB_DEFINITION_DISABLED: "CONFLICT",
  JOB_SCHEDULE_NOT_FOUND: "NOT_FOUND",
  JOB_SCHEDULE_DISABLED: "CONFLICT",
  JOB_RUN_NOT_FOUND: "NOT_FOUND",
  JOB_INVALID_IDEMPOTENCY_KEY: "BAD_REQUEST",
  JOB_IDEMPOTENCY_CONFLICT: "CONFLICT",
  JOB_INVALID_RETRY_POLICY: "BAD_REQUEST",
  JOB_SCHEDULE_CALCULATION_FAILED: "INTERNAL_SERVER_ERROR",
  JOB_INVALID_SCHEDULE_ADVANCE: "INTERNAL_SERVER_ERROR",
  JOB_LEASE_TOKEN_UNAVAILABLE: "INTERNAL_SERVER_ERROR",
  JOB_LEASE_LOST: "CONFLICT",
  JOB_CANCEL_REQUESTED: "CONFLICT",
  JOB_PERSISTENCE_FAILED: "INTERNAL_SERVER_ERROR",
} as const;

async function invokeJobs<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: jobErrorCodeMap,
      fallbackMessage: "The job operation failed",
    });
  }
}

type Call<TContext, TInput> = { context: TContext; input: TInput };

export function createJobActions<TContext extends JobsTransportContext>(
  resolveService: ResolveJobsService<TContext>,
) {
  return {
    enqueue: async ({ context, input }: Call<TContext, { jobId: string; requestKey: string; payload?: JobPayload; maxAttempts?: number }>) =>
      await invokeJobs(async () => {
        const result = await (await resolveService(context)).runs.enqueue(requireJobActor(context), input);
        return { ...result, run: toJobRunDto(result.run) };
      }),
    getRun: async ({ context, input }: Call<TContext, { runId: string }>) =>
      await invokeJobs(async () =>
        toJobRunDto(await (await resolveService(context)).runs.get(requireJobActor(context), input.runId)),
      ),
    cancelRun: async ({ context, input }: Call<TContext, { runId: string }>) =>
      await invokeJobs(async () => {
        const result = await (await resolveService(context)).runs.cancel(requireJobActor(context), input.runId);
        return { ...result, run: toJobRunDto(result.run) };
      }),
  };
}
`;
}
