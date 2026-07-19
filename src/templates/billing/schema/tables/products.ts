// @ts-nocheck - template file, drizzle-orm not installed in CLI
import { pgTable, uuid, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, recurringIntervalEnum } from "../enums.js";

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  provider: billingProviderEnum("provider").notNull(),
  providerProductId: text("provider_product_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const prices = pgTable("prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  provider: billingProviderEnum("provider").notNull(),
  providerPriceId: text("provider_price_id").notNull(),
  recurring: recurringIntervalEnum("recurring"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productRelations = relations(products, ({ many }) => ({
  prices: many(prices),
}));

export const priceRelations = relations(prices, ({ one }) => ({
  product: one(products, { fields: [prices.productId], references: [products.id] }),
}));
