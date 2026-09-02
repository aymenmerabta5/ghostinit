// @allow-long 650: the full lease state machine is colocated so every CAS predicate is reviewable
import type { ProjectMode } from "../../../lib/addons.js";

export function postgresJobsAdapterContent(mode: ProjectMode): string {
  const databaseImport =
    mode === "monorepo"
      ? `import { db, jobDefinitions, jobRunEvents, jobRuns, jobSchedules } from "@repo/database";`
      : `import { db } from "../../db";
import { jobDefinitions, jobRunEvents, jobRuns, jobSchedules } from "../../db/schema/jobs";`;
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "../../services/jobs";
  return `// @allow-long 620: transactional Postgres queue, lease CAS, retry, cancellation, and recovery
import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
${databaseImport}
import { definePostgresJobsAdapter } from "${serviceImport}";
import { sameJobPayload, toJobDefinition, toJobRun, toJobSchedule } from "./postgres-mappers";

function leaseColumns() {
  return {
    leaseWorkerId: null,
    leaseToken: null,
    leaseAcquiredAt: null,
    leaseHeartbeatAt: null,
    leaseExpiresAt: null,
  };
}

function activeLease(input: { runId: string; workerId: string; leaseToken: string; observedAt: Date }) {
  return and(
    eq(jobRuns.id, input.runId),
    eq(jobRuns.state, "running"),
    eq(jobRuns.leaseWorkerId, input.workerId),
    eq(jobRuns.leaseToken, input.leaseToken),
    gt(jobRuns.leaseExpiresAt, input.observedAt),
  );
}

function transitionKind(row: typeof jobRuns.$inferSelect) {
  return row.state === "cancelled" ? "cancelled" as const : "updated" as const;
}

async function ownedRun(runId: string, userId: string) {
  const rows = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.id, runId), eq(jobRuns.requestedByUserId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export const postgresJobsAdapter = definePostgresJobsAdapter({
  kind: "postgres" as const,

  async getDefinition(jobId) {
    const rows = await db.select().from(jobDefinitions).where(eq(jobDefinitions.id, jobId)).limit(1);
    return rows[0] ? toJobDefinition(rows[0]) : null;
  },

  async getSchedule(scheduleId) {
    const rows = await db.select().from(jobSchedules).where(eq(jobSchedules.id, scheduleId)).limit(1);
    return rows[0] ? toJobSchedule(rows[0]) : null;
  },

  async listDueSchedules(input) {
    const rows = await db
      .select()
      .from(jobSchedules)
      .where(and(eq(jobSchedules.enabled, true), lte(jobSchedules.nextRunAt, input.dueAt)))
      .orderBy(asc(jobSchedules.nextRunAt), asc(jobSchedules.id))
      .limit(input.limit);
    return rows.map(toJobSchedule);
  },

  async advanceSchedule(input) {
    const rows = await db
      .update(jobSchedules)
      .set({ nextRunAt: input.nextRunAt, updatedAt: input.updatedAt })
      .where(and(
        eq(jobSchedules.id, input.scheduleId),
        eq(jobSchedules.enabled, true),
        eq(jobSchedules.nextRunAt, input.expectedNextRunAt),
      ))
      .returning({ id: jobSchedules.id });
    return rows.length === 1;
  },

  async enqueueRun(input) {
    return await db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(jobRuns)
        .values({
          jobId: input.jobId,
          scheduleId: input.scheduleId,
          requestedByUserId: input.requestedByUserId,
          idempotencyKey: input.idempotencyKey,
          state: "queued",
          payload: input.payload,
          attempt: 0,
          maxAttempts: input.maxAttempts,
          availableAt: input.availableAt,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .onConflictDoNothing({ target: jobRuns.idempotencyKey })
        .returning();
      if (inserted[0]) return { kind: "accepted" as const, run: toJobRun(inserted[0]), created: true };
      const replay = await transaction
        .select()
        .from(jobRuns)
        .where(eq(jobRuns.idempotencyKey, input.idempotencyKey))
        .limit(1)
        .for("update");
      const existing = replay[0];
      if (!existing) throw new Error("Job idempotency conflict did not resolve");
      const sameRequest =
        existing.jobId === input.jobId &&
        existing.scheduleId === input.scheduleId &&
        existing.requestedByUserId === input.requestedByUserId &&
        existing.maxAttempts === input.maxAttempts &&
        sameJobPayload(existing.payload, input.payload);
      return sameRequest
        ? { kind: "accepted" as const, run: toJobRun(existing), created: false }
        : { kind: "conflict" as const };
    });
  },

  async getOwnedRun(input) {
    const row = await ownedRun(input.runId, input.userId);
    return row ? toJobRun(row) : null;
  },

  async requestCancellationOwned(input) {
    const changed = await db
      .update(jobRuns)
      .set({
        cancellationRequestedAt: input.requestedAt,
        state: sql\`case when \${jobRuns.state} = 'queued' then 'cancelled'::job_run_state else \${jobRuns.state} end\`,
        finishedAt: sql\`case when \${jobRuns.state} = 'queued' then \${input.requestedAt} else \${jobRuns.finishedAt} end\`,
        updatedAt: input.requestedAt,
      })
      .where(and(
        eq(jobRuns.id, input.runId),
        eq(jobRuns.requestedByUserId, input.userId),
        inArray(jobRuns.state, ["queued", "running"]),
        isNull(jobRuns.cancellationRequestedAt),
      ))
      .returning();
    if (changed[0]) return { run: toJobRun(changed[0]), changed: true };
    const existing = await ownedRun(input.runId, input.userId);
    return existing ? { run: toJobRun(existing), changed: false } : null;
  },

  async claimNextRun(input) {
    return await db.transaction(async (transaction) => {
      const candidates = await transaction
        .select()
        .from(jobRuns)
        .where(and(
          eq(jobRuns.state, "queued"),
          lte(jobRuns.availableAt, input.claimedAt),
          isNull(jobRuns.cancellationRequestedAt),
        ))
        .orderBy(asc(jobRuns.availableAt), asc(jobRuns.createdAt), asc(jobRuns.id))
        .limit(1)
        .for("update", { skipLocked: true });
      const candidate = candidates[0];
      if (!candidate) return null;
      const claimed = await transaction
        .update(jobRuns)
        .set({
          state: "running",
          attempt: sql\`\${jobRuns.attempt} + 1\`,
          leaseWorkerId: input.workerId,
          leaseToken: input.leaseToken,
          leaseAcquiredAt: input.claimedAt,
          leaseHeartbeatAt: input.claimedAt,
          leaseExpiresAt: input.leaseExpiresAt,
          startedAt: sql\`coalesce(\${jobRuns.startedAt}, \${input.claimedAt})\`,
          updatedAt: input.claimedAt,
        })
        .where(and(eq(jobRuns.id, candidate.id), eq(jobRuns.state, "queued"), isNull(jobRuns.cancellationRequestedAt)))
        .returning();
      return claimed[0] ? toJobRun(claimed[0]) : null;
    });
  },

  async getLeasedRun(input) {
    const rows = await db.select().from(jobRuns).where(activeLease(input)).limit(1);
    return rows[0] ? toJobRun(rows[0]) : null;
  },

  async heartbeatRun(input) {
    const rows = await db
      .update(jobRuns)
      .set({ leaseHeartbeatAt: input.heartbeatAt, leaseExpiresAt: input.leaseExpiresAt, updatedAt: input.heartbeatAt })
      .where(activeLease({ ...input, observedAt: input.heartbeatAt }))
      .returning();
    const row = rows[0];
    if (!row) return { kind: "lease-lost" as const };
    return row.cancellationRequestedAt
      ? { kind: "cancellation-requested" as const, run: toJobRun(row) }
      : { kind: "updated" as const, run: toJobRun(row) };
  },

  async completeRun(input) {
    const rows = await db
      .update(jobRuns)
      .set({
        state: sql\`case when \${jobRuns.cancellationRequestedAt} is null then 'succeeded'::job_run_state else 'cancelled'::job_run_state end\`,
        finishedAt: input.completedAt,
        updatedAt: input.completedAt,
        ...leaseColumns(),
      })
      .where(activeLease({ ...input, observedAt: input.completedAt }))
      .returning();
    const row = rows[0];
    return row ? { kind: transitionKind(row), run: toJobRun(row) } : { kind: "lease-lost" as const };
  },

  async settleFailedRun(input) {
    const nextState = input.retryAt ? "queued" : "failed";
    const rows = await db
      .update(jobRuns)
      .set({
        state: sql\`case when \${jobRuns.cancellationRequestedAt} is not null then 'cancelled'::job_run_state else \${nextState}::job_run_state end\`,
        availableAt: input.retryAt ?? input.failedAt,
        finishedAt: sql\`case when \${jobRuns.cancellationRequestedAt} is not null or \${input.retryAt} is null then \${input.failedAt} else null end\`,
        lastError: input.error,
        updatedAt: input.failedAt,
        ...leaseColumns(),
      })
      .where(activeLease({ ...input, observedAt: input.failedAt }))
      .returning();
    const row = rows[0];
    return row ? { kind: transitionKind(row), run: toJobRun(row) } : { kind: "lease-lost" as const };
  },

  async acknowledgeCancellation(input) {
    const rows = await db
      .update(jobRuns)
      .set({ state: "cancelled", finishedAt: input.cancelledAt, updatedAt: input.cancelledAt, ...leaseColumns() })
      .where(and(
        activeLease({ ...input, observedAt: input.cancelledAt }),
        isNotNull(jobRuns.cancellationRequestedAt),
      ))
      .returning();
    return rows[0]
      ? { kind: "cancelled" as const, run: toJobRun(rows[0]) }
      : { kind: "lease-lost" as const };
  },

  async listExpiredLeases(input) {
    const rows = await db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.state, "running"), isNotNull(jobRuns.leaseToken), lte(jobRuns.leaseExpiresAt, input.expiredAt)))
      .orderBy(asc(jobRuns.leaseExpiresAt), asc(jobRuns.id))
      .limit(input.limit);
    return rows.map(toJobRun);
  },

  async recoverExpiredLease(input) {
    const availableAt = input.recovery.state === "queued" ? input.recovery.availableAt : input.recoveredAt;
    const terminalAt = input.recovery.state === "queued" ? null : input.recovery.finishedAt;
    const rows = await db
      .update(jobRuns)
      .set({
        state: sql\`case when \${jobRuns.cancellationRequestedAt} is not null then 'cancelled'::job_run_state else \${input.recovery.state}::job_run_state end\`,
        availableAt,
        finishedAt: sql\`case when \${jobRuns.cancellationRequestedAt} is not null then \${input.recoveredAt} else \${terminalAt} end\`,
        lastError: sql\`case when \${jobRuns.cancellationRequestedAt} is not null then null else \${input.recovery.error} end\`,
        updatedAt: input.recoveredAt,
        ...leaseColumns(),
      })
      .where(and(
        eq(jobRuns.id, input.runId),
        eq(jobRuns.state, "running"),
        eq(jobRuns.leaseToken, input.expectedLeaseToken),
        eq(jobRuns.leaseExpiresAt, input.expectedLeaseExpiresAt),
        lte(jobRuns.leaseExpiresAt, input.recoveredAt),
      ))
      .returning();
    return rows[0] ? toJobRun(rows[0]) : null;
  },

  async completeRunWithResult(input: {
    runId: string; workerId: string; leaseToken: string; completedAt: Date; result: unknown;
  }) {
    const encoded = JSON.stringify(input.result);
    if (encoded === undefined || Buffer.byteLength(encoded, "utf8") > 262_144) {
      throw new Error("Job result must be JSON and at most 256 KiB");
    }
    const rows = await db.transaction(async (transaction) => {
      const completed = await transaction
        .update(jobRuns)
        .set({
          state: sql\`case when \${jobRuns.cancellationRequestedAt} is null then 'succeeded'::job_run_state else 'cancelled'::job_run_state end\`,
          result: JSON.parse(encoded),
          finishedAt: input.completedAt,
          updatedAt: input.completedAt,
          ...leaseColumns(),
        })
        .where(activeLease({ ...input, observedAt: input.completedAt }))
        .returning();
      const row = completed[0];
      if (!row) return null;
      await transaction.insert(jobRunEvents).values({
        runId: row.id,
        kind: row.state === "cancelled" ? "cancelled" : "succeeded",
        data: { result: JSON.parse(encoded) },
        createdAt: input.completedAt,
      });
      return toJobRun(row);
    });
    return rows;
  },

  async getOwnedResult(input: { runId: string; userId: string }) {
    const rows = await db
      .select({ state: jobRuns.state, result: jobRuns.result, finishedAt: jobRuns.finishedAt })
      .from(jobRuns)
      .where(and(eq(jobRuns.id, input.runId), eq(jobRuns.requestedByUserId, input.userId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async ensureDefinitions(definitions: ReadonlyArray<{
    id: string; type: string; enabled: boolean; defaultMaxAttempts: number;
  }>) {
    const now = new Date();
    await db.transaction(async (transaction) => {
      for (const definition of definitions) {
        await transaction
          .insert(jobDefinitions)
          .values({ ...definition, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: jobDefinitions.id,
            set: {
              type: definition.type,
              enabled: definition.enabled,
              defaultMaxAttempts: definition.defaultMaxAttempts,
              updatedAt: now,
            },
          });
      }
    });
  },
});

export type PostgresJobsRuntimeAdapter = typeof postgresJobsAdapter;
`;
}
