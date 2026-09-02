// @allow-long 340: actor-derived enqueue/read/cancel/result operations stay colocated for auditability
export function convexJobsPublicContent(): string {
  return `// @allow-long 320: public job operations derive ownership from the authenticated app actor
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireActor } from "./lib/auth";

const payloadValue = v.union(v.string(), v.number(), v.boolean(), v.null());
const payload = v.record(v.string(), payloadValue);

function canonical(value: string): string {
  return encodeURIComponent(value.normalize("NFKC"));
}

function manualIdempotencyKey(jobKey: string, userId: string, requestKey: string): string {
  const key = requestKey.trim();
  if (!key || key.length > 200) {
    throw new ConvexError({ code: "INVALID_IDEMPOTENCY_KEY", message: "A request key is required" });
  }
  return ["job", "v1", "manual", canonical(jobKey), canonical(userId), canonical(key)].join(":");
}

function stablePayload(value: Record<string, string | number | boolean | null>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function publicRun(run: {
  _id: string;
  jobId: string;
  scheduleId?: string;
  requestedByUserId?: string;
  idempotencyKey: string;
  state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  payload: Record<string, string | number | boolean | null>;
  result?: unknown;
  attempt: number;
  maxAttempts: number;
  availableAt: number;
  cancellationRequestedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}) {
  return {
    id: run._id,
    jobId: run.jobId,
    scheduleId: run.scheduleId ?? null,
    requestedByUserId: run.requestedByUserId ?? null,
    idempotencyKey: run.idempotencyKey,
    state: run.state,
    payload: run.payload,
    result: run.result ?? null,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    availableAt: run.availableAt,
    cancellationRequestedAt: run.cancellationRequestedAt ?? null,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    lastError: run.lastError ?? null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export const enqueue = mutation({
  args: {
    jobKey: v.string(),
    requestKey: v.string(),
    payload,
    maxAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const definition = await ctx.db
      .query("jobDefinitions")
      .withIndex("by_key", (indexQuery) => indexQuery.eq("key", args.jobKey))
      .unique();
    if (!definition) throw new ConvexError({ code: "JOB_NOT_FOUND", message: "Job definition not found" });
    if (!definition.enabled) throw new ConvexError({ code: "JOB_DISABLED", message: "Job definition is disabled" });
    const maxAttempts = args.maxAttempts ?? definition.defaultMaxAttempts;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 25) {
      throw new ConvexError({ code: "INVALID_RETRY_POLICY", message: "Maximum attempts is invalid" });
    }
    const idempotencyKey = manualIdempotencyKey(definition.key, actor._id, args.requestKey);
    const existing = await ctx.db
      .query("jobRuns")
      .withIndex("by_idempotency", (indexQuery) => indexQuery.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing) {
      const sameRequest =
        existing.jobId === definition._id &&
        existing.requestedByUserId === actor._id &&
        existing.maxAttempts === maxAttempts &&
        stablePayload(existing.payload) === stablePayload(args.payload);
      if (!sameRequest) throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Request key was reused" });
      return { run: publicRun(existing), created: false };
    }
    const now = Date.now();
    const runId = await ctx.db.insert("jobRuns", {
      jobId: definition._id,
      requestedByUserId: actor._id,
      idempotencyKey,
      state: "queued",
      payload: args.payload,
      attempt: 0,
      maxAttempts,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const run = await ctx.db.get(runId);
    if (!run) throw new ConvexError({ code: "PERSISTENCE_FAILED", message: "Job run was not committed" });
    await ctx.scheduler.runAfter(0, internal.jobActions.execute, { runId });
    return { run: publicRun(run), created: true };
  },
});

export const get = query({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    return run && run.requestedByUserId === actor._id ? publicRun(run) : null;
  },
});

export const result = query({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.requestedByUserId !== actor._id) return null;
    return { state: run.state, result: run.result ?? null, finishedAt: run.finishedAt ?? null };
  },
});

export const cancel = mutation({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.requestedByUserId !== actor._id) return null;
    if (["succeeded", "failed", "cancelled"].includes(run.state) || run.cancellationRequestedAt !== undefined) {
      return { run: publicRun(run), changed: false };
    }
    const now = Date.now();
    await ctx.db.patch(run._id, run.state === "queued"
      ? { state: "cancelled", cancellationRequestedAt: now, finishedAt: now, updatedAt: now }
      : { cancellationRequestedAt: now, updatedAt: now });
    const updated = await ctx.db.get(run._id);
    if (!updated) throw new ConvexError({ code: "PERSISTENCE_FAILED", message: "Job cancellation was not committed" });
    return { run: publicRun(updated), changed: true };
  },
});
`;
}
