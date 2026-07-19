// @ts-nocheck - template
import {
  pgTable,
  uuid,
  text,
  boolean,
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_events_provider_event_unique").on(t.provider, t.providerEventId),
    index("webhook_events_provider_idx").on(t.provider),
    index("webhook_events_type_idx").on(t.type),
    index("webhook_events_processed_idx").on(t.processed),
  ],
);
