// @ts-nocheck - template
import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, subscriptionStatusEnum } from "../enums.js";
import { prices } from "./products.js";
import { customers } from "./customers.js";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end"),
    trialEnd: timestamp("trial_end"),
    priceId: uuid("price_id").references(() => prices.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_provider_id_unique").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_provider_idx").on(t.provider),
    index("subscriptions_status_idx").on(t.status),
    index("subscriptions_price_idx").on(t.priceId),
  ],
);

export const subscriptionRelations = relations(subscriptions, ({ one }) => ({
  price: one(prices, { fields: [subscriptions.priceId], references: [prices.id] }),
  customer: one(customers, { fields: [subscriptions.customerId], references: [customers.id] }),
}));
