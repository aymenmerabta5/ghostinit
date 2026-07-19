// @ts-nocheck - template
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, licenseKeyStatusEnum } from "../enums.js";
import { subscriptions } from "./subscriptions.js";

export const license_keys = pgTable(
  "license_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    status: licenseKeyStatusEnum("status").notNull().default("active"),
    provider: billingProviderEnum("provider").notNull().default("polar"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("license_keys_subscription_idx").on(t.subscriptionId),
    index("license_keys_provider_idx").on(t.provider),
  ],
);

export const licenseKeyRelations = relations(license_keys, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [license_keys.subscriptionId],
    references: [subscriptions.id],
  }),
}));
