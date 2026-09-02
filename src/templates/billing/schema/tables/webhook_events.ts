// @ts-nocheck - template
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { billingProviderEnum } from "../enums.js";

export const webhook_events = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: billingProviderEnum("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    processed: boolean("processed").notNull().default(false),
    attemptCount: integer("attempt_count").notNull().default(0),
    processingStartedAt: timestamp("processing_started_at"),
    leaseToken: text("lease_token"),
    processedAt: timestamp("processed_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_unique").on(t.provider, t.providerEventId),
    uniqueIndex("webhook_events_lease_token_unique").on(t.leaseToken),
    index("webhook_events_provider_idx").on(t.provider),
    index("webhook_events_type_idx").on(t.type),
    index("webhook_events_processed_idx").on(t.processed),
  ],
);
