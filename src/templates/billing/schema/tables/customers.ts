// @ts-nocheck - template
import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { billingProviderEnum } from "../enums.js";

export const customers = pgTable(
  "billing_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    email: varchar("email", { length: 255 }),
    name: text("name"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("billing_customers_provider_customer_unique").on(t.provider, t.providerCustomerId),
    uniqueIndex("billing_customers_user_provider_unique").on(t.userId, t.provider),
    index("billing_customers_user_idx").on(t.userId),
  ],
);
