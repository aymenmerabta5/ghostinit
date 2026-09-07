// @allow-long 423: drizzle schema + client + migration config for the postgres path, emitted as one coherent set
/**
 * Generated project database package template.
 * Now aggregates billing schema for db.query.webhook_events support.
 * Source of truth for billing tables remains billing package, but we duplicate them here
 * (similar to single mode src/server/db/schema/tables/*) to avoid circular dependency.
 */

import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";
import { tryLoadTemplate } from "./template-loader.js";
import {
  identityDataModelBlueprint,
  renderPostgresIdentitySchema,
} from "../domain/data-model/index.js";

// Uses the shared multi-root resolver: a naive join(thisDir, rel) always fails
// once bundled into dist/cli.js, which silently emitted a billing barrel whose
// ./tables/* targets were never written.
const tryLoadBilling = tryLoadTemplate;

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
    "# start-database.sh — GhostInit quick Postgres starter (alternative to docker compose --env-file .env.local up -d)",
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
    '    echo "Error: openssl not found and POSTGRES_PASSWORD is not set. Install openssl or set a strong POSTGRES_PASSWORD in .env.local." >&2',
    "    exit 1",
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
    "# Postgres 18+ owns a versioned PGDATA below /var/lib/postgresql.",
    "# Mount the parent so image upgrades preserve the intended layout.",
    "$ENGINE run -d \\",
    '  --name "$CONTAINER" \\',
    '  -e POSTGRES_USER="$DB_USER" \\',
    '  -e POSTGRES_PASSWORD="$DB_PASSWORD" \\',
    '  -e POSTGRES_DB="$DB_NAME" \\',
    '  -p "127.0.0.1:$DB_PORT:5432" \\',
    '  -v "${PROJECT}_postgres_data:/var/lib/postgresql" \\',
    `  ${v.postgresDocker.image}`,
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
  features: { auth?: boolean; billing?: boolean; posts?: boolean } = {},
): TemplateFile[] {
  let effectiveRuntime: "node" | "bun" = "bun";
  if (runtime === "node" || runtime === "bun") {
    effectiveRuntime = runtime;
  } else if (_projectNameOrRuntime === "node" || _projectNameOrRuntime === "bun") {
    effectiveRuntime = _projectNameOrRuntime as "node" | "bun";
  }
  const drizzleExecutor =
    effectiveRuntime === "bun"
      ? "bun --env-file=../../.env.local drizzle-kit"
      : "node --env-file=../../.env.local ./node_modules/drizzle-kit/bin.cjs";
  const hasAuth = features.auth ?? true;
  const hasBilling = features.billing ?? true;
  const hasPosts = hasAuth && (features.posts ?? true);
  const schemaExports = [
    "// Generated by ghostinit sync. Do not edit manually.",
    ...(hasAuth ? ['export * from "./auth.js";'] : []),
    ...(hasBilling ? ['export * from "./billing.js";', 'export * from "./enums.js";'] : []),
    ...(hasPosts ? ['export * from "./posts.js";'] : []),
    "",
  ].join("\n");

  const baseFiles: TemplateFile[] = [
    file(
      "packages/database/package.json",
      packageJson({
        name: "@repo/database",
        exports: {
          ".": "./src/index.ts",
          "./schema": "./src/schema/index.ts",
        },
        scripts: {
          ...codeScripts(),
          "db:generate": `${drizzleExecutor} generate`,
          "db:migrate": `${drizzleExecutor} migrate`,
          "db:push": `${drizzleExecutor} push`,
        },
        dependencies: {
          "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          pg: `^${v.database.pg}`,
          "@repo/config": "workspace:*",
        },
        devDependencies: {
          // tsconfig declares types: ["node"], so the package must depend on it —
          // otherwise TS2688 "Cannot find type definition file for 'node'".
          "@types/node": `^${v.runtime["@types/node"]}`,
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
          types: ["node"],
          outDir: "./dist",
          // Explicit rootDir — without it TS6 raises TS5011 once declaration output
          // is enabled, which failed the generated project's typecheck.
          rootDir: "./src",
          declaration: true,
        },
      }),
    ),
    file(
      "packages/database/src/index.ts",
      `import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "@repo/config/server";
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
    encodeURIComponent(user) +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    encodeURIComponent(db)
  );
}

function rejectConnectionStringTlsOverrides(connectionString: string): void {
  if (env.DATABASE_SSL !== "true") return;
  const parsed = new URL(connectionString);
  for (const key of parsed.searchParams.keys()) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("ssl") || normalized === "uselibpqcompat") {
      throw new Error("DATABASE_URL must not override TLS parameters when DATABASE_SSL=true");
    }
  }
}

const connectionString = buildConnectionString();
rejectConnectionStringTlsOverrides(connectionString);

const poolConfig: pg.PoolConfig = {
  connectionString,
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

function buildConnectionString(): string {
  const user = process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_PASSWORD ?? "";
  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? process.env.APP_NAME ?? "ghostinit";
  return (
    "postgresql://" +
    encodeURIComponent(user) +
    ":" +
    encodeURIComponent(password) +
    "@" +
    host +
    ":" +
    port +
    "/" +
    encodeURIComponent(db)
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? buildConnectionString() },
});
`,
    ),
    file("packages/database/src/schema/index.ts", schemaExports),
    ...(hasAuth
      ? [
          file(
            "packages/database/src/schema/auth.ts",
            renderPostgresIdentitySchema(identityDataModelBlueprint),
          ),
        ]
      : []),
    ...(hasPosts
      ? [
          file(
            "packages/database/src/schema/posts.ts",
            `import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.js";

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
`,
          ),
        ]
      : []),
  ];

  if (!hasBilling) return baseFiles;

  // ---- Billing aggregation: duplicate billing schema into database package ----
  // Source of truth remains @repo/billing, but we copy tables to database for db.query support and tsc aggregate root.
  // This avoids circular dependency (database -> billing -> database) by copying, not importing.

  // index.ts is preferred over billing.ts deliberately. billing.ts is a thin
  // barrel that does `export { customerRelations } from "./index"` — which is
  // correct inside packages/billing, but here "./index" resolves to
  // packages/database/src/schema/index.ts, the ghostinit-sync barrel that itself
  // re-exports "./billing". That cycle meant customerRelations was never
  // actually exported from @repo/database. index.ts is self-contained: it
  // defines customerRelations and re-exports ./enums + ./tables/*.
  const billingBarrelContent =
    tryLoadBilling("./billing/schema/index.ts") ??
    tryLoadBilling("./billing/schema/billing.ts") ??
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

  // The barrel above re-exports every one of these. If a table template cannot be
  // located we must NOT silently skip it — that produced a barrel importing files
  // that were never written, and the generated project failed to typecheck.
  const missingTables: string[] = [];
  for (const table of tableNames) {
    const content = tryLoadBilling(`./billing/schema/tables/${table}.ts`);
    if (content) {
      baseFiles.push(file(`packages/database/src/schema/tables/${table}.ts`, content));
    } else {
      missingTables.push(table);
    }
  }
  if (missingTables.length > 0) {
    throw new Error(
      `[ghostinit] billing table templates missing: ${missingTables.join(", ")}. ` +
        `packages/database/src/schema/billing.ts re-exports them, so emitting the ` +
        `barrel without them would produce a project that cannot typecheck.`,
    );
  }

  // Also emit index.ts inside tables? Not needed, but ensure billing barrel re-export is complete.
  // For backwards compat, also emit packages/database/src/schema/billing as folder index barrel via same file
  // (already have billing.ts). Also generate tables barrel re-export via index.ts in tables for completeness if needed.

  return baseFiles;
}
