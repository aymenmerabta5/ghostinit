import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function postgresEveOwnershipSchemaFile(mode: ProjectMode): TemplateFile {
  const path =
    mode === "monorepo" ? "packages/database/src/schema/eve.ts" : "src/server/db/schema/eve.ts";
  return file(
    path,
    `import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, teams, users } from "./auth${mode === "monorepo" ? ".js" : ""}";

export const eveAgentSessions = pgTable(
  "eve_agent_sessions",
  {
    eveSessionId: text("eve_session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    // Retain the non-secret Better Auth session id for audit even after that
    // login session is revoked or deleted. It is deliberately not a foreign
    // key: logout must never be blocked by durable agent history.
    createdByAuthSessionId: text("created_by_auth_session_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    index("eve_agent_sessions_owner_idx").on(
      table.userId,
      table.organizationId,
      table.teamId,
    ),
    index("eve_agent_sessions_auth_session_idx").on(table.createdByAuthSessionId),
    index("eve_agent_sessions_retired_idx").on(table.retiredAt),
  ],
);

/**
 * Latest Eve-authored event per durable session. Its clock is exclusively
 * Eve's event clock, so callback replay ordering never compares app and Eve
 * wall clocks. It may precede the application ownership claim.
 */
export const eveAgentRuntimeSessions = pgTable("eve_agent_runtime_sessions", {
  eveSessionId: text("eve_session_id").primaryKey(),
  lastEventId: text("last_event_id").notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Append-only replay fence for lifecycle callbacks and authenticated tail
 * reconciliation. Event ids, rather than cross-process wall clocks, decide
 * whether one durable Eve event has already been applied.
 */
export const eveAgentRuntimeEvents = pgTable(
  "eve_agent_runtime_events",
  {
    eventId: text("event_id").primaryKey(),
    eveSessionId: text("eve_session_id").notNull(),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("eve_agent_runtime_events_session_idx").on(table.eveSessionId, table.receivedAt)],
);

/**
 * Durable admission leases bound successful paid operations per actor across
 * processes. Expired rows are pruned opportunistically by the adapter.
 */
export const eveAgentAdmissions = pgTable(
  "eve_agent_admissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    eveSessionId: text("eve_session_id"),
    operation: text("operation").$type<"create" | "follow" | "compact">().notNull(),
    plan: text("plan").$type<"pro" | "sponsored">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    lastRuntimeEventId: text("last_runtime_event_id"),
    lastRuntimeEventAt: timestamp("last_runtime_event_at", { withTimezone: true }),
  },
  (table) => [
    index("eve_agent_admissions_user_created_idx").on(table.userId, table.createdAt),
    index("eve_agent_admissions_user_expiry_idx").on(table.userId, table.expiresAt),
    index("eve_agent_admissions_user_session_idx").on(table.userId, table.eveSessionId),
    index("eve_agent_admissions_session_created_idx").on(
      table.eveSessionId,
      table.createdAt,
    ),
  ],
);
`,
  );
}

export function convexEveOwnershipSchemaFile(): TemplateFile {
  return file(
    "convex/schema/eve.ts",
    `import { defineTable } from "convex/server";
import { v } from "convex/values";

export const eveTables = {
  eveAgentSessions: defineTable({
    eveSessionId: v.string(),
    userId: v.id("users"),
    organizationId: v.optional(v.id("identityOrganizations")),
    teamId: v.optional(v.id("identityTeams")),
    createdByAuthSessionId: v.string(),
    createdAt: v.number(),
    retiredAt: v.optional(v.number()),
  })
    .index("by_eve_session", ["eveSessionId"])
    .index("by_owner", ["userId", "organizationId", "teamId"])
    .index("by_auth_session", ["createdByAuthSessionId"])
    .index("by_retired", ["retiredAt"]),
  eveAgentRuntimeSessions: defineTable({
    eveSessionId: v.string(),
    lastEventId: v.string(),
    lastEventAt: v.number(),
    updatedAt: v.number(),
  }).index("by_eve_session", ["eveSessionId"]),
  eveAgentRuntimeEvents: defineTable({
    eventId: v.string(),
    eveSessionId: v.string(),
    eventType: v.string(),
    eventAt: v.number(),
    receivedAt: v.number(),
  })
    .index("by_event_id", ["eventId"])
    .index("by_eve_session", ["eveSessionId", "receivedAt"]),
  eveAgentAdmissions: defineTable({
    leaseId: v.optional(v.string()),
    userId: v.id("users"),
    organizationId: v.optional(v.id("identityOrganizations")),
    teamId: v.optional(v.id("identityTeams")),
    eveSessionId: v.optional(v.string()),
    operation: v.union(v.literal("create"), v.literal("follow"), v.literal("compact")),
    plan: v.union(v.literal("pro"), v.literal("sponsored")),
    createdAt: v.number(),
    expiresAt: v.number(),
    releasedAt: v.optional(v.number()),
    lastRuntimeEventId: v.optional(v.string()),
    lastRuntimeEventAt: v.optional(v.number()),
  })
    .index("by_lease", ["leaseId"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_expiry", ["userId", "expiresAt"])
    .index("by_user_release", ["userId", "releasedAt"])
    .index("by_user_session", ["userId", "eveSessionId"])
    .index("by_session", ["eveSessionId"]),
};
`,
  );
}
