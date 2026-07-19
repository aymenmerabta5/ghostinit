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
    provider: billingProviderEnum("provider").notNull(),
    providerCheckoutId: text("provider_checkout_id").notNull(),
    url: text("url"),
    status: checkoutStatusEnum("status").notNull().default("pending"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    priceId: uuid("price_id").references(() => prices.id, { onDelete: "set null" }),
    amount: integer("amount"),
    currency: varchar("currency", { length: 10 }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("checkouts_provider_id_unique").on(t.provider, t.providerCheckoutId),
    index("checkouts_customer_idx").on(t.customerId),
    index("checkouts_provider_idx").on(t.provider),
    index("checkouts_status_idx").on(t.status),
  ],
);

export const checkoutRelations = relations(checkouts, ({ one }) => ({
  customer: one(customers, { fields: [checkouts.customerId], references: [customers.id] }),
  price: one(prices, { fields: [checkouts.priceId], references: [prices.id] }),
}));
