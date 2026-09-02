// @ts-nocheck - template
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, invoiceStatusEnum } from "../enums.js";
import { subscriptions } from "./subscriptions.js";
import { customers } from "./customers.js";

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    providerInvoiceId: text("provider_invoice_id").notNull(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    paid: boolean("paid").notNull().default(false),
    amount: integer("amount").notNull(),
    tax: integer("tax"),
    currency: varchar("currency", { length: 10 }),
    status: invoiceStatusEnum("status").notNull().default("open"),
    hostedUrl: text("hosted_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    providerEventAt: timestamp("provider_event_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_provider_id_unique").on(t.provider, t.providerInvoiceId),
    index("invoices_user_idx").on(t.userId),
    index("invoices_subscription_idx").on(t.subscriptionId),
    index("invoices_customer_idx").on(t.customerId),
    index("invoices_provider_idx").on(t.provider),
  ],
);

export const invoiceRelations = relations(invoices, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
}));
