// @allow-long 430: cohesive generated job orchestration with scheduler, worker lease, and recovery APIs
import { jobsServerOnly } from "./shared.js";

export function jobsServiceContent(): string {
  return `${jobsServerOnly}
import { JobError, isJobError } from "./errors.js";
import {
  DEFAULT_JOB_RETRY_POLICY,
  assertJobActor,
  assertJobWorker,
  calculateJobRetryDelayMs,
  createManualRunIdempotencyKey,
  createScheduledRunIdempotencyKey,
} from "./policy.js";
import type { JobActor, JobPayload, JobRetryPolicy, JobRun, JobWorker } from "./contracts.js";
import type {
  JobLeaseTokenPort,
  JobLeaseTransitionResult,
  JobPersistencePort,
  JobScheduleCalculatorPort,
} from "./ports.js";

export interface JobsServiceDependencies {
  persistence: JobPersistencePort;
  scheduleCalculator: JobScheduleCalculatorPort;
  leaseTokens: JobLeaseTokenPort;
  now?: () => Date;
  leaseDurationMs?: number;
  retryPolicy?: JobRetryPolicy;
}

async function persist<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isJobError(error)) throw error;
    throw new JobError("JOB_PERSISTENCE_FAILED", "The job operation could not be committed", {
      cause: error,
    });
  }
}

function validateMaxAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    throw new JobError("JOB_INVALID_RETRY_POLICY", "Maximum attempts must be between one and twenty-five");
  }
  return value;
}

function requireLease(result: JobLeaseTransitionResult): Exclude<JobLeaseTransitionResult, { kind: "lease-lost" }> {
  if (result.kind === "lease-lost") {
    throw new JobError("JOB_LEASE_LOST", "The worker no longer owns this job lease");
  }
  return result;
}

export function createJobsService({
  persistence,
  scheduleCalculator,
  leaseTokens,
  now = () => new Date(),
  leaseDurationMs = 30_000,
  retryPolicy = DEFAULT_JOB_RETRY_POLICY,
}: JobsServiceDependencies) {
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs < 1_000) {
    throw new JobError("JOB_INVALID_RETRY_POLICY", "The worker lease duration is invalid");
  }
  calculateJobRetryDelayMs(1, retryPolicy);

  async function requireEnabledDefinition(jobId: string) {
    const definition = await persist(async () => await persistence.getDefinition(jobId));
    if (!definition) throw new JobError("JOB_DEFINITION_NOT_FOUND", "Job definition not found");
    if (!definition.enabled) throw new JobError("JOB_DEFINITION_DISABLED", "Job definition is disabled");
    return definition;
  }

  async function enqueueRun(input: Parameters<JobPersistencePort["enqueueRun"]>[0]) {
    const result = await persist(async () => await persistence.enqueueRun(input));
    if (result.kind === "conflict") {
      throw new JobError(
        "JOB_IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used for a different job request",
      );
    }
    return { run: result.run, created: result.created };
  }

  const runs = {
    async enqueue(
      actor: JobActor,
      input: {
        jobId: string;
        requestKey: string;
        payload?: JobPayload;
        maxAttempts?: number;
      },
    ) {
      assertJobActor(actor);
      const definition = await requireEnabledDefinition(input.jobId);
      const createdAt = now();
      return await enqueueRun({
        jobId: definition.id,
        scheduleId: null,
        requestedByUserId: actor.userId,
        idempotencyKey: createManualRunIdempotencyKey(definition.id, actor.userId, input.requestKey),
        payload: input.payload ?? {},
        maxAttempts: validateMaxAttempts(input.maxAttempts ?? definition.defaultMaxAttempts),
        availableAt: createdAt,
        createdAt,
      });
    },

    async get(actor: JobActor, runId: string) {
      assertJobActor(actor);
      const run = await persist(async () => await persistence.getOwnedRun({ runId, userId: actor.userId }));
      if (!run) throw new JobError("JOB_RUN_NOT_FOUND", "Job run not found");
      return run;
    },

    async cancel(actor: JobActor, runId: string) {
      assertJobActor(actor);
      const result = await persist(async () =>
        await persistence.requestCancellationOwned({ runId, userId: actor.userId, requestedAt: now() }),
      );
      if (!result) throw new JobError("JOB_RUN_NOT_FOUND", "Job run not found");
      return result;
    },
  };

  async function materializeSchedule(scheduleId: string, scheduledFor: Date) {
    const schedule = await persist(async () => await persistence.getSchedule(scheduleId));
    if (!schedule) throw new JobError("JOB_SCHEDULE_NOT_FOUND", "Job schedule not found");
    if (!schedule.enabled) throw new JobError("JOB_SCHEDULE_DISABLED", "Job schedule is disabled");
    const definition = await requireEnabledDefinition(schedule.jobId);
    const createdAt = now();
    const enqueued = await enqueueRun({
      jobId: definition.id,
      scheduleId: schedule.id,
      requestedByUserId: null,
      idempotencyKey: createScheduledRunIdempotencyKey(definition.id, schedule.id, scheduledFor),
      payload: schedule.payload,
      maxAttempts: validateMaxAttempts(schedule.maxAttempts),
      availableAt: scheduledFor,
      createdAt,
    });
    let nextRunAt: Date;
    try {
      nextRunAt = await scheduleCalculator.nextAfter(schedule, scheduledFor);
    } catch (error) {
      throw new JobError(
        "JOB_SCHEDULE_CALCULATION_FAILED",
        "The next scheduled run could not be calculated",
        { cause: error },
      );
    }
    if (!Number.isFinite(nextRunAt.getTime()) || nextRunAt.getTime() <= scheduledFor.getTime()) {
      throw new JobError("JOB_INVALID_SCHEDULE_ADVANCE", "The schedule calculator did not advance time");
    }
    const advanced = await persist(async () =>
      await persistence.advanceSchedule({
        scheduleId: schedule.id,
        expectedNextRunAt: scheduledFor,
        nextRunAt,
        updatedAt: createdAt,
      }),
    );
    return { ...enqueued, scheduleAdvanced: advanced, nextRunAt };
  }

  const schedules = {
    materialize: materializeSchedule,
    async tick(limit = 50) {
      const dueAt = now();
      const schedules = await persist(async () =>
        await persistence.listDueSchedules({ dueAt, limit: Math.min(Math.max(limit, 1), 100) }),
      );
      const results = [];
      for (const schedule of schedules) {
        results.push(await materializeSchedule(schedule.id, schedule.nextRunAt));
      }
      return results;
    },
  };

  const workers = {
    async claim(worker: JobWorker) {
      assertJobWorker(worker);
      const claimedAt = now();
      let leaseToken: string;
      try {
        leaseToken = await leaseTokens.create();
      } catch (error) {
        throw new JobError("JOB_LEASE_TOKEN_UNAVAILABLE", "A worker lease token could not be issued", {
          cause: error,
        });
      }
      if (!leaseToken.trim()) throw new JobError("JOB_LEASE_LOST", "A lease token could not be issued");
      return await persist(async () =>
        await persistence.claimNextRun({
          workerId: worker.workerId,
          leaseToken,
          claimedAt,
          leaseExpiresAt: new Date(claimedAt.getTime() + leaseDurationMs),
        }),
      );
    },

    async heartbeat(worker: JobWorker, runId: string, leaseToken: string) {
      assertJobWorker(worker);
      const heartbeatAt = now();
      const result = requireLease(
        await persist(async () =>
          await persistence.heartbeatRun({
            runId,
            workerId: worker.workerId,
            leaseToken,
            heartbeatAt,
            leaseExpiresAt: new Date(heartbeatAt.getTime() + leaseDurationMs),
          }),
        ),
      );
      return { run: result.run, cancellationRequested: result.kind === "cancellation-requested" };
    },

    async succeed(worker: JobWorker, runId: string, leaseToken: string) {
      assertJobWorker(worker);
      return requireLease(
        await persist(async () =>
          await persistence.completeRun({
            runId,
            workerId: worker.workerId,
            leaseToken,
            completedAt: now(),
          }),
        ),
      );
    },

    async fail(
      worker: JobWorker,
      input: { runId: string; leaseToken: string; error: string; retryable: boolean },
    ) {
      assertJobWorker(worker);
      const failedAt = now();
      const run = await persist(async () =>
        await persistence.getLeasedRun({
          runId: input.runId,
          workerId: worker.workerId,
          leaseToken: input.leaseToken,
          observedAt: failedAt,
        }),
      );
      if (!run) throw new JobError("JOB_LEASE_LOST", "The worker no longer owns this job lease");
      if (run.cancellationRequestedAt) {
        return requireLease(
          await persist(async () =>
            await persistence.acknowledgeCancellation({
              runId: run.id,
              workerId: worker.workerId,
              leaseToken: input.leaseToken,
              cancelledAt: failedAt,
            }),
          ),
        );
      }
      const retryAt =
        input.retryable && run.attempt < run.maxAttempts
          ? new Date(failedAt.getTime() + calculateJobRetryDelayMs(run.attempt, retryPolicy))
          : null;
      return requireLease(
        await persist(async () =>
          await persistence.settleFailedRun({
            runId: run.id,
            workerId: worker.workerId,
            leaseToken: input.leaseToken,
            failedAt,
            error: input.error.slice(0, 2_000),
            retryAt,
          }),
        ),
      );
    },

    async acknowledgeCancellation(worker: JobWorker, runId: string, leaseToken: string) {
      assertJobWorker(worker);
      return requireLease(
        await persist(async () =>
          await persistence.acknowledgeCancellation({
            runId,
            workerId: worker.workerId,
            leaseToken,
            cancelledAt: now(),
          }),
        ),
      );
    },

    async recoverExpiredLeases(limit = 100) {
      const recoveredAt = now();
      const expired = await persist(async () =>
        await persistence.listExpiredLeases({
          expiredAt: recoveredAt,
          limit: Math.min(Math.max(limit, 1), 500),
        }),
      );
      const recovered: JobRun[] = [];
      let raced = 0;
      for (const run of expired) {
        const lease = run.lease;
        if (!lease) continue;
        const recovery = run.cancellationRequestedAt
          ? { state: "cancelled" as const, finishedAt: recoveredAt, error: null }
          : run.attempt >= run.maxAttempts
            ? {
                state: "failed" as const,
                finishedAt: recoveredAt,
                error: "Worker lease expired after the final attempt",
              }
            : {
                state: "queued" as const,
                availableAt: new Date(
                  recoveredAt.getTime() + calculateJobRetryDelayMs(run.attempt, retryPolicy),
                ),
                error: "Worker lease expired before completion",
              };
        const result = await persist(async () =>
          await persistence.recoverExpiredLease({
            runId: run.id,
            expectedLeaseToken: lease.token,
            expectedLeaseExpiresAt: lease.expiresAt,
            recoveredAt,
            recovery,
          }),
        );
        if (result) recovered.push(result);
        else raced += 1;
      }
      return { examined: expired.length, recovered, raced };
    },
  };

  return { runs, schedules, workers };
}

export type JobsService = ReturnType<typeof createJobsService>;
`;
}
