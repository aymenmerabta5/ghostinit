// @ts-nocheck - template
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, checkoutStatusEnum } from "../enums.js";
import { customers } from "./customers.js";
import { prices } from "./products.js";

export const checkouts = pgTable(
  "checkouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    providerCheckoutId: text("provider_checkout_id"),
    requestKey: text("request_key"),
    creationState: text("creation_state").notNull().default("ready"),
    creationStartedAt: timestamp("creation_started_at"),
    creationLeaseToken: text("creation_lease_token"),
    url: text("url"),
    status: checkoutStatusEnum("status").notNull().default("pending"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    priceId: uuid("price_id").references(() => prices.id, { onDelete: "set null" }),
    amount: integer("amount"),
    currency: varchar("currency", { length: 10 }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    providerEventAt: timestamp("provider_event_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("checkouts_provider_id_unique").on(t.provider, t.providerCheckoutId),
    uniqueIndex("checkouts_user_provider_request_unique").on(t.userId, t.provider, t.requestKey),
    index("checkouts_user_idx").on(t.userId),
    index("checkouts_customer_idx").on(t.customerId),
    index("checkouts_provider_idx").on(t.provider),
    index("checkouts_status_idx").on(t.status),
  ],
);

export const checkoutRelations = relations(checkouts, ({ one }) => ({
  customer: one(customers, { fields: [checkouts.customerId], references: [customers.id] }),
  price: one(prices, { fields: [checkouts.priceId], references: [prices.id] }),
}));
