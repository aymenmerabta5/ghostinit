/**
 * Generated project database package template.
 * Now aggregates billing schema for db.query.webhook_events support.
 * Source of truth for billing tables remains billing package, but we duplicate them here
 * (similar to single mode src/server/db/schema/tables/*) to avoid circular dependency.
 */

import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));
function tryLoadBilling(rel: string): string | null {
  try {
    return readFileSync(join(thisDir, rel), "utf-8");
  } catch {
    return null;
  }
}

/**
 * start-database.sh — quick postgres container start, inspired by create-t3-app's
 * template/extras/start-database/*.sh. Supports docker/podman detection, port check,
 * reuse existing container, random password via openssl if default, reading .env.local.
 */
export function startDatabaseFiles(projectName: string): TemplateFile[] {
  const safeName = projectName.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase();
  // Use array of lines to avoid TS template literal escaping hell with bash ${} and quotes
  const content = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# start-database.sh — GhostInit quick Postgres starter (alternative to docker compose up -d)",
    `# Container: \${PROJECT}_postgres by default, sanitized project name ${safeName}_postgres`,
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    `PROJECT="${safeName}"`,
    'ENV_FILE="$SCRIPT_DIR/.env.local"',
    'CONTAINER="${PROJECT}_postgres"',
    "",
    "# Load env safely — parse KEY=VALUE without executing command substitution",
    'SAFE_ENV_KEYS="POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_PORT DATABASE_URL"',
    'if [ -f "$ENV_FILE" ]; then',
    "  while IFS='=' read -r key value; do",
    "    for allowed in $SAFE_ENV_KEYS; do",
    '      if [ "$key" = "$allowed" ]; then',
    '        export "$key=$value"',
    "        break",
    "      fi",
    "    done",
    "  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' \"$ENV_FILE\" 2>/dev/null || true)",
    "fi",
    "",
    'DB_USER="${POSTGRES_USER:-postgres}"',
    'DB_PORT="${POSTGRES_PORT:-5432}"',
    'DB_NAME="${POSTGRES_DB:-$PROJECT}"',
    'DB_PASSWORD_RAW="${POSTGRES_PASSWORD:-}"',
    "",
    'PLACEHOLDER_MASK="REPLACE_WITH_"',
    'if [[ -z "$DB_PASSWORD_RAW" || "$DB_PASSWORD_RAW" == "$PLACEHOLDER_MASK"* || "$DB_PASSWORD_RAW" == "password" ]]; then',
    "  if command -v openssl >/dev/null 2>&1; then",
    "    DB_PASSWORD=\"$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)\"",
    '    echo "Generated random Postgres password (store in .env.local POSTGRES_PASSWORD)" >&2',
    "  else",
    '    echo "Warning: openssl not found, using default password postgres. Install openssl or set POSTGRES_PASSWORD in .env.local for production." >&2',
    '    DB_PASSWORD="postgres"',
    "  fi",
    "else",
    '  DB_PASSWORD="$DB_PASSWORD_RAW"',
    "fi",
    "",
    'ENGINE="docker"',
    "if ! command -v docker >/dev/null 2>&1; then",
    "  if command -v podman >/dev/null 2>&1; then",
    '    ENGINE="podman"',
    "  else",
    '    echo "Error: neither docker nor podman found. Install one." >&2',
    "    exit 1",
    "  fi",
    "fi",
    "",
    "if ! $ENGINE info >/dev/null 2>&1; then",
    '  echo "Error: $ENGINE daemon not running or $ENGINE info failed." >&2',
    "  exit 1",
    "fi",
    "",
    "if $ENGINE ps -a --format '{{.Names}}' 2>/dev/null | grep -q \"^$CONTAINER$\"; then",
    "  if $ENGINE ps --format '{{.Names}}' 2>/dev/null | grep -q \"^$CONTAINER$\"; then",
    '    echo "$CONTAINER already running."',
    "    exit 0",
    "  else",
    '    echo "Starting existing container $CONTAINER..."',
    '    $ENGINE start "$CONTAINER" >/dev/null',
    '    echo "$CONTAINER started."',
    "    exit 0",
    "  fi",
    "fi",
    "",
    "if command -v nc >/dev/null 2>&1; then",
    '  if nc -z localhost "$DB_PORT" 2>/dev/null; then',
    '    echo "Warning: port $DB_PORT already in use, another Postgres may be running." >&2',
    "  fi",
    "fi",
    "",
    'echo "Creating and starting $CONTAINER on port $DB_PORT (DB: $DB_NAME, user: $DB_USER)..."',
    "",
    "$ENGINE run -d \\",
    '  --name "$CONTAINER" \\',
    '  -e POSTGRES_USER="$DB_USER" \\',
    '  -e POSTGRES_PASSWORD="$DB_PASSWORD" \\',
    '  -e POSTGRES_DB="$DB_NAME" \\',
    '  -p "$DB_PORT:5432" \\',
    '  -v "${PROJECT}_postgres_data:/var/lib/postgresql/data" \\',
    "  postgres:18.4",
    "",
    'echo "$CONTAINER created and started."',
    'echo "DATABASE_URL=postgresql://$DB_USER:****@localhost:$DB_PORT/$DB_NAME"',
    'echo "To view logs: $ENGINE logs -f $CONTAINER"',
    'echo "To stop: $ENGINE stop $CONTAINER && $ENGINE rm $CONTAINER"',
  ].join("\n");

  return [file("start-database.sh", content)];
}

export function databasePackage(
  _projectNameOrRuntime?: string,
  runtime?: "node" | "bun",
): TemplateFile[] {
  let effectiveRuntime: "node" | "bun" = "bun";
  if (runtime === "node" || runtime === "bun") {
    effectiveRuntime = runtime;
  } else if (_projectNameOrRuntime === "node" || _projectNameOrRuntime === "bun") {
    effectiveRuntime = _projectNameOrRuntime as "node" | "bun";
  }
  const executor = effectiveRuntime === "bun" ? "bun" : "node";

  const baseFiles: TemplateFile[] = [
    file(
      "packages/database/package.json",
      packageJson({
        name: "@repo/database",
        exports: { ".": "./src/index.ts" },
        scripts: {
          ...codeScripts(),
          "db:generate": `${executor} --env-file=../../.env.local drizzle-kit generate`,
          "db:migrate": `${executor} --env-file=../../.env.local drizzle-kit migrate`,
          "db:push": `${executor} --env-file=../../.env.local drizzle-kit push`,
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
      `// Generated by ghostinit sync. Do not edit manually.
export * from "./auth";
export * from "./billing";
export * from "./enums";
export * from "./posts";
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

  // ---- Billing aggregation: duplicate billing schema into database package ----
  // Source of truth remains @repo/billing, but we copy tables to database for db.query support and tsc aggregate root.
  // This avoids circular dependency (database -> billing -> database) by copying, not importing.

  const billingBarrelContent =
    tryLoadBilling("./billing/schema/billing.ts") ??
    tryLoadBilling("./billing/schema/index.ts") ??
    `// Fallback billing barrel - explicit re-exports
export {
  billingProviderEnum,
  subscriptionStatusEnum,
  checkoutStatusEnum,
  invoiceStatusEnum,
  licenseKeyStatusEnum,
  recurringIntervalEnum,
} from "./enums.js";
export { products, prices, productRelations, priceRelations } from "./tables/products.js";
export { customers } from "./tables/customers.js";
export { subscriptions, subscriptionRelations } from "./tables/subscriptions.js";
export { checkouts, checkoutRelations } from "./tables/checkouts.js";
export { invoices, invoiceRelations } from "./tables/invoices.js";
export { license_keys, licenseKeyRelations } from "./tables/license_keys.js";
export { usage_events } from "./tables/usage_events.js";
export { webhook_events } from "./tables/webhook_events.js";
`;

  const enumsContent =
    tryLoadBilling("./billing/schema/enums.ts") ??
    `import { pgEnum } from "drizzle-orm/pg-core";
export const billingProviderEnum = pgEnum("billing_provider", ["stripe","chargily","paddle","polar"]);
export const subscriptionStatusEnum = pgEnum("billing_subscription_status", ["active","trialing","past_due","canceled","unpaid","incomplete","incomplete_expired","paused","expired","on_trial","trial_ended"]);
export const checkoutStatusEnum = pgEnum("billing_checkout_status", ["pending","paid","completed","failed","open","expired"]);
export const invoiceStatusEnum = pgEnum("billing_invoice_status", ["draft","open","paid","void","uncollectible"]);
export const licenseKeyStatusEnum = pgEnum("billing_license_key_status", ["active","revoked","expired"]);
export const recurringIntervalEnum = pgEnum("billing_recurring_interval", ["month","year","week","day","one_time"]);
`;

  baseFiles.push(file("packages/database/src/schema/billing.ts", billingBarrelContent));
  baseFiles.push(file("packages/database/src/schema/enums.ts", enumsContent));

  const tableNames = [
    "products",
    "customers",
    "subscriptions",
    "checkouts",
    "invoices",
    "license_keys",
    "usage_events",
    "webhook_events",
  ];

  for (const table of tableNames) {
    const rel = `./billing/schema/tables/${table}.ts`;
    const content = tryLoadBilling(rel);
    if (content) {
      baseFiles.push(file(`packages/database/src/schema/tables/${table}.ts`, content));
    }
  }

  // Also emit index.ts inside tables? Not needed, but ensure billing barrel re-export is complete.
  // For backwards compat, also emit packages/database/src/schema/billing as folder index barrel via same file
  // (already have billing.ts). Also generate tables barrel re-export via index.ts in tables for completeness if needed.

  return baseFiles;
}
