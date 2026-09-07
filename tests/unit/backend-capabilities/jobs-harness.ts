// @allow-long 520: in-memory CAS adapter covers the complete generated jobs persistence contract

export interface TestJobDefinition {
  id: string;
  type: string;
  enabled: boolean;
  defaultMaxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestJobSchedule {
  id: string;
  jobId: string;
  expression: string;
  timezone: string;
  enabled: boolean;
  payload: Readonly<Record<string, unknown>>;
  maxAttempts: number;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestJobLease {
  workerId: string;
  token: string;
  acquiredAt: Date;
  heartbeatAt: Date;
  expiresAt: Date;
}

export interface TestJobRun {
  id: string;
  jobId: string;
  scheduleId: string | null;
  requestedByUserId: string | null;
  idempotencyKey: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  payload: Readonly<Record<string, unknown>>;
  attempt: number;
  maxAttempts: number;
  availableAt: Date;
  lease: TestJobLease | null;
  cancellationRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestJobsState {
  definitions: TestJobDefinition[];
  schedules: TestJobSchedule[];
  runs: TestJobRun[];
}

function sameInstant(first: Date, second: Date): boolean {
  return first.getTime() === second.getTime();
}

export function createJobsHarness(initialNow: Date) {
  let clock = initialNow;
  let nextRunId = 1;
  let nextTokenId = 1;
  let beforeRecover: ((run: TestJobRun) => void) | undefined;
  const state: TestJobsState = {
    definitions: [
      {
        id: "email.digest",
        type: "email.digest",
        enabled: true,
        defaultMaxAttempts: 3,
        createdAt: initialNow,
        updatedAt: initialNow,
      },
    ],
    schedules: [
      {
        id: "daily-digest",
        jobId: "email.digest",
        expression: "0 9 * * *",
        timezone: "UTC",
        enabled: true,
        payload: { source: "schedule" },
        maxAttempts: 3,
        nextRunAt: initialNow,
        createdAt: initialNow,
        updatedAt: initialNow,
      },
    ],
    runs: [],
  };

  function leasedRun(input: {
    runId: string;
    workerId: string;
    leaseToken: string;
    observedAt: Date;
  }): TestJobRun | null {
    const run = state.runs.find(({ id }) => id === input.runId);
    if (
      !run ||
      run.state !== "running" ||
      !run.lease ||
      run.lease.workerId !== input.workerId ||
      run.lease.token !== input.leaseToken ||
      run.lease.expiresAt.getTime() <= input.observedAt.getTime()
    ) {
      return null;
    }
    return run;
  }

  function cancelRun(run: TestJobRun, cancelledAt: Date): TestJobRun {
    run.state = "cancelled";
    run.cancellationRequestedAt ??= cancelledAt;
    run.finishedAt = cancelledAt;
    run.updatedAt = cancelledAt;
    run.lease = null;
    return run;
  }

  const persistence = {
    async getDefinition(jobId: string) {
      return state.definitions.find(({ id }) => id === jobId) ?? null;
    },
    async getSchedule(scheduleId: string) {
      return state.schedules.find(({ id }) => id === scheduleId) ?? null;
    },
    async listDueSchedules(input: { dueAt: Date; limit: number }) {
      return state.schedules
        .filter(({ enabled, nextRunAt }) => enabled && nextRunAt.getTime() <= input.dueAt.getTime())
        .slice(0, input.limit);
    },
    async advanceSchedule(input: {
      scheduleId: string;
      expectedNextRunAt: Date;
      nextRunAt: Date;
      updatedAt: Date;
    }) {
      const schedule = state.schedules.find(({ id }) => id === input.scheduleId);
      if (!schedule || !sameInstant(schedule.nextRunAt, input.expectedNextRunAt)) return false;
      schedule.nextRunAt = input.nextRunAt;
      schedule.updatedAt = input.updatedAt;
      return true;
    },
    async enqueueRun(input: {
      jobId: string;
      scheduleId: string | null;
      requestedByUserId: string | null;
      idempotencyKey: string;
      payload: Readonly<Record<string, unknown>>;
      maxAttempts: number;
      availableAt: Date;
      createdAt: Date;
    }) {
      const existing = state.runs.find(
        ({ idempotencyKey }) => idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        const sameRequest =
          existing.jobId === input.jobId &&
          existing.scheduleId === input.scheduleId &&
          existing.requestedByUserId === input.requestedByUserId &&
          existing.maxAttempts === input.maxAttempts &&
          JSON.stringify(existing.payload) === JSON.stringify(input.payload);
        return sameRequest
          ? { kind: "accepted" as const, run: existing, created: false }
          : { kind: "conflict" as const };
      }
      const run: TestJobRun = {
        id: `run-${nextRunId++}`,
        ...input,
        state: "queued",
        attempt: 0,
        lease: null,
        cancellationRequestedAt: null,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        updatedAt: input.createdAt,
      };
      state.runs.push(run);
      return { kind: "accepted" as const, run, created: true };
    },
    async getOwnedRun(input: { runId: string; userId: string }) {
      return (
        state.runs.find(
          ({ id, requestedByUserId }) => id === input.runId && requestedByUserId === input.userId,
        ) ?? null
      );
    },
    async requestCancellationOwned(input: { runId: string; userId: string; requestedAt: Date }) {
      const run = state.runs.find(
        ({ id, requestedByUserId }) => id === input.runId && requestedByUserId === input.userId,
      );
      if (!run) return null;
      if (["succeeded", "failed", "cancelled"].includes(run.state)) {
        return { run, changed: false };
      }
      if (run.cancellationRequestedAt) return { run, changed: false };
      run.cancellationRequestedAt = input.requestedAt;
      run.updatedAt = input.requestedAt;
      if (run.state === "queued") cancelRun(run, input.requestedAt);
      return { run, changed: true };
    },
    async claimNextRun(input: {
      workerId: string;
      leaseToken: string;
      claimedAt: Date;
      leaseExpiresAt: Date;
    }) {
      const run = state.runs.find(
        ({ state: runState, availableAt }) =>
          runState === "queued" && availableAt.getTime() <= input.claimedAt.getTime(),
      );
      if (!run) return null;
      run.state = "running";
      run.attempt += 1;
      run.startedAt ??= input.claimedAt;
      run.updatedAt = input.claimedAt;
      run.lease = {
        workerId: input.workerId,
        token: input.leaseToken,
        acquiredAt: input.claimedAt,
        heartbeatAt: input.claimedAt,
        expiresAt: input.leaseExpiresAt,
      };
      return run;
    },
    async getLeasedRun(input: {
      runId: string;
      workerId: string;
      leaseToken: string;
      observedAt: Date;
    }) {
      return leasedRun(input);
    },
    async heartbeatRun(input: {
      runId: string;
      workerId: string;
      leaseToken: string;
      heartbeatAt: Date;
      leaseExpiresAt: Date;
    }) {
      const run = leasedRun({ ...input, observedAt: input.heartbeatAt });
      if (!run?.lease) return { kind: "lease-lost" as const };
      run.lease.heartbeatAt = input.heartbeatAt;
      run.lease.expiresAt = input.leaseExpiresAt;
      run.updatedAt = input.heartbeatAt;
      return run.cancellationRequestedAt
        ? { kind: "cancellation-requested" as const, run }
        : { kind: "updated" as const, run };
    },
    async completeRun(input: {
      runId: string;
      workerId: string;
      leaseToken: string;
      completedAt: Date;
    }) {
      const run = leasedRun({ ...input, observedAt: input.completedAt });
      if (!run) return { kind: "lease-lost" as const };
      if (run.cancellationRequestedAt) {
        return { kind: "cancelled" as const, run: cancelRun(run, input.completedAt) };
      }
      run.state = "succeeded";
      run.finishedAt = input.completedAt;
      run.updatedAt = input.completedAt;
      run.lease = null;
      return { kind: "updated" as const, run };
    },
    async settleFailedRun(input: {
      runId: string;
      workerId: string;
      leaseToken: string;
      failedAt: Date;
      error: string;
      retryAt: Date | null;
    }) {
      const run = leasedRun({ ...input, observedAt: input.failedAt });
      if (!run) return { kind: "lease-lost" as const };
      if (run.cancellationRequestedAt) {
        return { kind: "cancelled" as const, run: cancelRun(run, input.failedAt) };
      }
      run.lastError = input.error;
      run.updatedAt = input.failedAt;
      run.lease = null;
      if (input.retryAt) {
        run.state = "queued";
        run.availableAt = input.retryAt;
        return { kind: "updated" as const, run };
      }
      run.state = "failed";
      run.finishedAt = input.failedAt;
      return { kind: "updated" as const, run };
    },
    async acknowledgeCancellation(input: {
      runId: string;
      workerId: string;
      leaseToken: string;
      cancelledAt: Date;
    }) {
      const run = leasedRun({ ...input, observedAt: input.cancelledAt });
      if (!run || !run.cancellationRequestedAt) return { kind: "lease-lost" as const };
      return { kind: "cancelled" as const, run: cancelRun(run, input.cancelledAt) };
    },
    async listExpiredLeases(input: { expiredAt: Date; limit: number }) {
      return state.runs
        .filter(
          ({ state: runState, lease }) =>
            runState === "running" &&
            lease !== null &&
            lease.expiresAt.getTime() <= input.expiredAt.getTime(),
        )
        .slice(0, input.limit);
    },
    async recoverExpiredLease(input: {
      runId: string;
      expectedLeaseToken: string;
      expectedLeaseExpiresAt: Date;
      recoveredAt: Date;
      recovery:
        | { state: "queued"; availableAt: Date; error: string }
        | { state: "failed" | "cancelled"; finishedAt: Date; error: string | null };
    }) {
      const run = state.runs.find(({ id }) => id === input.runId);
      if (run) beforeRecover?.(run);
      if (
        !run?.lease ||
        run.state !== "running" ||
        run.lease.token !== input.expectedLeaseToken ||
        !sameInstant(run.lease.expiresAt, input.expectedLeaseExpiresAt) ||
        run.lease.expiresAt.getTime() > input.recoveredAt.getTime()
      ) {
        return null;
      }
      run.lease = null;
      run.updatedAt = input.recoveredAt;
      if (run.cancellationRequestedAt) {
        return cancelRun(run, input.recoveredAt);
      }
      run.lastError = input.recovery.error;
      if (input.recovery.state === "queued") {
        run.state = "queued";
        run.availableAt = input.recovery.availableAt;
      } else {
        run.state = input.recovery.state;
        run.finishedAt = input.recovery.finishedAt;
      }
      return run;
    },
  };

  return {
    persistence,
    scheduleCalculator: {
      nextAfter(_schedule: TestJobSchedule, scheduledFor: Date) {
        return new Date(scheduledFor.getTime() + 60_000);
      },
    },
    leaseTokens: { create: () => `lease-${nextTokenId++}` },
    now: () => clock,
    setNow(value: Date) {
      clock = value;
    },
    setBeforeRecover(value: ((run: TestJobRun) => void) | undefined) {
      beforeRecover = value;
    },
    state,
  };
}
