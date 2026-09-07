// @allow-long 520: the Convex transactional state machine is colocated for lease and cancellation review
export function convexJobsInternalContent(): string {
  return `// @allow-long 500: internal scheduler, lease CAS, heartbeat, result, retry, and crash recovery
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const resultValue = v.union(v.string(), v.number(), v.boolean(), v.null());
const resultRecord = v.record(v.string(), resultValue);

function scheduledKey(jobKey: string, scheduleId: string, scheduledFor: number): string {
  return [
    "job",
    "v1",
    "scheduled",
    encodeURIComponent(jobKey.normalize("NFKC")),
    encodeURIComponent(scheduleId),
    new Date(scheduledFor).toISOString(),
  ].join(":");
}

function intervalMilliseconds(expression: string): number {
  const match = /^@every:([0-9]+)$/.exec(expression.trim());
  const milliseconds = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 60_000 || milliseconds > 366 * 24 * 60 * 60 * 1_000) {
    throw new Error("Convex job schedules use @every:<milliseconds> between one minute and one year");
  }
  return milliseconds;
}

export const ensureDefinitions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const definitions = [{ key: "system.echo", type: "system.echo", enabled: true, defaultMaxAttempts: 3 }];
    for (const definition of definitions) {
      const existing = await ctx.db
        .query("jobDefinitions")
        .withIndex("by_key", (indexQuery) => indexQuery.eq("key", definition.key))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
      else await ctx.db.insert("jobDefinitions", { ...definition, createdAt: now, updatedAt: now });
    }
    return definitions.length;
  },
});

export const tickSchedules = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const limit = Math.min(Math.max(Math.trunc(args.limit), 1), 100);
    const schedules = await ctx.db
      .query("jobSchedules")
      .withIndex("by_due", (indexQuery) => indexQuery.eq("enabled", true).lte("nextRunAt", now))
      .take(limit);
    let created = 0;
    let replayed = 0;
    for (const schedule of schedules) {
      const definition = await ctx.db.get(schedule.jobId);
      if (!definition || !definition.enabled) continue;
      const scheduledFor = schedule.nextRunAt;
      const idempotencyKey = scheduledKey(definition.key, schedule._id, scheduledFor);
      const existing = await ctx.db
        .query("jobRuns")
        .withIndex("by_idempotency", (indexQuery) => indexQuery.eq("idempotencyKey", idempotencyKey))
        .unique();
      let runId = existing?._id;
      if (!runId) {
        runId = await ctx.db.insert("jobRuns", {
          jobId: definition._id,
          scheduleId: schedule._id,
          idempotencyKey,
          state: "queued",
          payload: schedule.payload,
          attempt: 0,
          maxAttempts: schedule.maxAttempts,
          availableAt: scheduledFor,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      } else {
        replayed += 1;
      }
      await ctx.db.patch(schedule._id, {
        nextRunAt: scheduledFor + intervalMilliseconds(schedule.expression),
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.jobActions.execute, { runId });
    }
    return { examined: schedules.length, created, replayed };
  },
});

export const claim = internalMutation({
  args: { runId: v.id("jobRuns"), workerId: v.string(), leaseToken: v.string(), leaseMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.runId);
    if (!run || run.state !== "queued" || run.availableAt > now || run.cancellationRequestedAt !== undefined) return null;
    const definition = await ctx.db.get(run.jobId);
    if (!definition || !definition.enabled) return null;
    await ctx.db.patch(run._id, {
      state: "running",
      attempt: run.attempt + 1,
      leaseWorkerId: args.workerId,
      leaseToken: args.leaseToken,
      leaseAcquiredAt: now,
      leaseHeartbeatAt: now,
      leaseExpiresAt: now + args.leaseMs,
      startedAt: run.startedAt ?? now,
      updatedAt: now,
    });
    return {
      runId: run._id,
      jobType: definition.type,
      payload: run.payload,
      attempt: run.attempt + 1,
      leaseToken: args.leaseToken,
    };
  },
});

export const heartbeat = internalMutation({
  args: { runId: v.id("jobRuns"), workerId: v.string(), leaseToken: v.string(), leaseMs: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.runId);
    if (
      !run || run.state !== "running" || run.leaseWorkerId !== args.workerId ||
      run.leaseToken !== args.leaseToken || !run.leaseExpiresAt || run.leaseExpiresAt <= now
    ) return { kind: "lease-lost" as const };
    await ctx.db.patch(run._id, { leaseHeartbeatAt: now, leaseExpiresAt: now + args.leaseMs, updatedAt: now });
    return { kind: run.cancellationRequestedAt ? "cancellation-requested" as const : "updated" as const };
  },
});

export const succeed = internalMutation({
  args: { runId: v.id("jobRuns"), workerId: v.string(), leaseToken: v.string(), result: resultRecord },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.runId);
    if (
      !run || run.state !== "running" || run.leaseWorkerId !== args.workerId ||
      run.leaseToken !== args.leaseToken || !run.leaseExpiresAt || run.leaseExpiresAt <= now
    ) return { kind: "lease-lost" as const };
    const state = run.cancellationRequestedAt ? "cancelled" as const : "succeeded" as const;
    await ctx.db.patch(run._id, {
      state,
      result: args.result,
      finishedAt: now,
      updatedAt: now,
      leaseWorkerId: undefined,
      leaseToken: undefined,
      leaseAcquiredAt: undefined,
      leaseHeartbeatAt: undefined,
      leaseExpiresAt: undefined,
    });
    await ctx.db.insert("jobRunEvents", {
      runId: run._id,
      kind: state,
      data: args.result,
      createdAt: now,
    });
    return { kind: state };
  },
});

export const fail = internalMutation({
  args: { runId: v.id("jobRuns"), workerId: v.string(), leaseToken: v.string(), error: v.string(), retryable: v.boolean() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const run = await ctx.db.get(args.runId);
    if (
      !run || run.state !== "running" || run.leaseWorkerId !== args.workerId ||
      run.leaseToken !== args.leaseToken || !run.leaseExpiresAt || run.leaseExpiresAt <= now
    ) return { kind: "lease-lost" as const };
    const cancelled = run.cancellationRequestedAt !== undefined;
    const retry = !cancelled && args.retryable && run.attempt < run.maxAttempts;
    const delay = Math.min(15 * 60_000, 1_000 * 2 ** Math.max(0, run.attempt - 1));
    const state = cancelled ? "cancelled" as const : retry ? "queued" as const : "failed" as const;
    await ctx.db.patch(run._id, {
      state,
      availableAt: retry ? now + delay : run.availableAt,
      finishedAt: retry ? undefined : now,
      lastError: args.error.slice(0, 2_000),
      updatedAt: now,
      leaseWorkerId: undefined,
      leaseToken: undefined,
      leaseAcquiredAt: undefined,
      leaseHeartbeatAt: undefined,
      leaseExpiresAt: undefined,
    });
    if (retry) await ctx.scheduler.runAfter(delay, internal.jobActions.execute, { runId: run._id });
    return { kind: state, retryAt: retry ? now + delay : null };
  },
});

export const recoverExpired = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("jobRuns")
      .withIndex("by_lease_expiry", (indexQuery) => indexQuery.eq("state", "running").lte("leaseExpiresAt", now))
      .take(Math.min(Math.max(Math.trunc(args.limit), 1), 500));
    let recovered = 0;
    for (const run of expired) {
      if (!run.leaseExpiresAt || run.leaseExpiresAt > now) continue;
      const cancelled = run.cancellationRequestedAt !== undefined;
      const retry = !cancelled && run.attempt < run.maxAttempts;
      const state = cancelled ? "cancelled" as const : retry ? "queued" as const : "failed" as const;
      const delay = Math.min(15 * 60_000, 1_000 * 2 ** Math.max(0, run.attempt - 1));
      await ctx.db.patch(run._id, {
        state,
        availableAt: retry ? now + delay : run.availableAt,
        finishedAt: retry ? undefined : now,
        lastError: cancelled ? undefined : "Worker lease expired before completion",
        updatedAt: now,
        leaseWorkerId: undefined,
        leaseToken: undefined,
        leaseAcquiredAt: undefined,
        leaseHeartbeatAt: undefined,
        leaseExpiresAt: undefined,
      });
      if (retry) await ctx.scheduler.runAfter(delay, internal.jobActions.execute, { runId: run._id });
      recovered += 1;
    }
    return { examined: expired.length, recovered };
  },
});
`;
}
