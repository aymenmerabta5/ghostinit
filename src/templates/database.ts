/**
 * Generated project database package template.
 */

import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export function databasePackage(runtime: "node" | "bun" = "bun"): TemplateFile[] {
  const executor = runtime === "bun" ? "bun" : "node";
  return [
    file(
      "packages/database/package.json",
      packageJson({
        name: "@repo/database",
        exports: { ".": "./src/index.ts" },
        scripts: {
          ...codeScripts(),
          "db:generate": `${executor} --env-file=../../.env drizzle-kit generate`,
          "db:migrate": `${executor} --env-file=../../.env drizzle-kit migrate`,
          "db:push": `${executor} --env-file=../../.env drizzle-kit push`,
        },
        dependencies: {
          "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          pg: `^${v.database.pg}`,
          "@repo/config": "workspace:*",
        },
        devDependencies: {
          "@types/pg": `^${v.database["@types/pg"]}`,
          "drizzle-kit": `^${v.database["drizzle-kit"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/database/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          outDir: "./dist",
          declaration: true,
        },
      }),
    ),
    file(
      "packages/database/src/index.ts",
      `import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@repo/config";
import * as schema from "./schema/index.js";

function buildConnectionString(): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }
  const user = env.POSTGRES_USER ?? "postgres";
  const password = env.POSTGRES_PASSWORD ?? "";
  const host = env.POSTGRES_HOST ?? "localhost";
  const port = env.POSTGRES_PORT ?? "5432";
  const db = env.POSTGRES_DB ?? env.APP_NAME ?? "ghostinit";
  return (
    "postgresql://" +
    user +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    db
  );
}

const poolConfig: pg.PoolConfig = {
  connectionString: buildConnectionString(),
  max: env.DATABASE_POOL_SIZE ?? 20,
  idleTimeoutMillis: 30000,
};

if (env.DATABASE_SSL === "true") {
  // Production: verify the server certificate. Provide a CA via DATABASE_SSL_CA
  // if you are connecting through a self-signed intermediary.
  poolConfig.ssl = env.DATABASE_SSL_CA
    ? { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true }
    : true;
}

export const pool = new pg.Pool(poolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema/index.js";
`,
    ),
    file(
      "packages/database/drizzle.config.ts",
      `import { defineConfig } from "drizzle-kit";
import { env } from "@repo/config";

function buildConnectionString(): string {
  const user = process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_PASSWORD ?? "";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? process.env.APP_NAME ?? "ghostinit";
  return (
    "postgresql://" +
    user +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    db
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: env.DATABASE_URL ?? buildConnectionString() },
});
`,
    ),
    file(
      "packages/database/src/schema/index.ts",
      `export * from "./auth.js";
export * from "./posts.js";
`,
    ),
    file(
      "packages/database/src/schema/auth.ts",
      `import { relations } from "drizzle-orm";
import { pgTable, uuid, varchar, timestamp, text, boolean, integer } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("email_verified"),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  provider: varchar("provider", { length: 255 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: uuid("impersonated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const twoFactor = pgTable("two_factor", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(),
  backupCodes: text("backup_codes").notNull(),
  verified: boolean("verified").default(false),
  failedVerificationCount: integer("failed_verification_count").default(0),
  lockedUntil: timestamp("locked_until"),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  twoFactors: many(twoFactor),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  impersonatedByUser: one(users, { fields: [sessions.impersonatedBy], references: [users.id] }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(users, { fields: [twoFactor.userId], references: [users.id] }),
}));
`,
    ),
    file(
      "packages/database/src/schema/posts.ts",
      `import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth.js";

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
`,
    ),
  ];
}
