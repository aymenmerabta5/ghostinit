// @ts-nocheck - template
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { billingProviderEnum } from "../enums.js";
import { subscriptions } from "./subscriptions.js";

export const usage_events = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    credits: integer("credits"),
    externalCustomerId: text("external_customer_id"),
    organizationId: text("organization_id"),
    externalId: text("external_id"),
    provider: billingProviderEnum("provider").notNull().default("polar"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("usage_events_subscription_idx").on(t.subscriptionId),
    index("usage_events_org_idx").on(t.organizationId),
    index("usage_events_external_customer_idx").on(t.externalCustomerId),
    index("usage_events_provider_idx").on(t.provider),
    uniqueIndex("usage_events_external_id_unique").on(t.externalId),
  ],
);
