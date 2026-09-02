export function postgresJobsSchemaContent(userFacingApi = true): string {
  return `import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
${userFacingApi ? 'import { users } from "./auth";' : ""}

export const jobRunState = pgEnum("job_run_state", ["queued", "running", "succeeded", "failed", "cancelled"]);

export const jobDefinitions = pgTable("job_definitions", {
  id: text("id").primaryKey(),
  type: text("type").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  defaultMaxAttempts: integer("default_max_attempts").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobSchedules = pgTable(
  "job_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull().references(() => jobDefinitions.id, { onDelete: "cascade" }),
    expression: text("expression").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(true),
    payload: jsonb("payload").notNull().default({}),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_schedules_due_idx").on(table.enabled, table.nextRunAt, table.id)],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: text("job_id").notNull().references(() => jobDefinitions.id, { onDelete: "restrict" }),
    scheduleId: uuid("schedule_id").references(() => jobSchedules.id, { onDelete: "set null" }),
    requestedByUserId: text("requested_by_user_id")${userFacingApi ? '.references(() => users.id, { onDelete: "set null" })' : ""},
    idempotencyKey: text("idempotency_key").notNull(),
    state: jobRunState("state").notNull().default("queued"),
    payload: jsonb("payload").notNull().default({}),
    result: jsonb("result"),
    attempt: integer("attempt").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leaseWorkerId: text("lease_worker_id"),
    leaseToken: text("lease_token"),
    leaseAcquiredAt: timestamp("lease_acquired_at", { withTimezone: true }),
    leaseHeartbeatAt: timestamp("lease_heartbeat_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("job_runs_idempotency_uidx").on(table.idempotencyKey),
    index("job_runs_claim_idx").on(table.state, table.availableAt, table.createdAt),
    index("job_runs_lease_expiry_idx").on(table.state, table.leaseExpiresAt),
    index("job_runs_owner_idx").on(table.requestedByUserId, table.createdAt),
  ],
);

export const jobRunEvents = pgTable(
  "job_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => jobRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    message: text("message"),
    data: jsonb("data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_run_events_run_created_idx").on(table.runId, table.createdAt)],
);
`;
}

export function convexJobsSchemaContent(userFacingApi = true): string {
  return `import { defineTable } from "convex/server";
import { v } from "convex/values";

const jsonValue = v.union(v.string(), v.number(), v.boolean(), v.null());
const jsonRecord = v.record(v.string(), jsonValue);
const runState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

/** Spread this object into the root defineSchema call. */
export const jobTables = {
  jobDefinitions: defineTable({
    key: v.string(),
    type: v.string(),
    enabled: v.boolean(),
    defaultMaxAttempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]).index("by_type", ["type"]),
  jobSchedules: defineTable({
    jobId: v.id("jobDefinitions"),
    expression: v.string(),
    timezone: v.string(),
    enabled: v.boolean(),
    payload: jsonRecord,
    maxAttempts: v.number(),
    nextRunAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_due", ["enabled", "nextRunAt"]),
  jobRuns: defineTable({
    jobId: v.id("jobDefinitions"),
    scheduleId: v.optional(v.id("jobSchedules")),
    requestedByUserId: v.optional(${userFacingApi ? 'v.id("users")' : "v.string()"}),
    idempotencyKey: v.string(),
    state: runState,
    payload: jsonRecord,
    result: v.optional(jsonRecord),
    attempt: v.number(),
    maxAttempts: v.number(),
    availableAt: v.number(),
    leaseWorkerId: v.optional(v.string()),
    leaseToken: v.optional(v.string()),
    leaseAcquiredAt: v.optional(v.number()),
    leaseHeartbeatAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    cancellationRequestedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_claim", ["state", "availableAt", "createdAt"])
    .index("by_lease_expiry", ["state", "leaseExpiresAt"])
    .index("by_owner_created", ["requestedByUserId", "createdAt"]),
  jobRunEvents: defineTable({
    runId: v.id("jobRuns"),
    kind: v.string(),
    message: v.optional(v.string()),
    data: jsonRecord,
    createdAt: v.number(),
  }).index("by_run_created", ["runId", "createdAt"]),
};
`;
}
