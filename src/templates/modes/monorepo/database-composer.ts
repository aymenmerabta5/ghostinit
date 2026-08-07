// @allow-long 6-imports: database composer aggregates postgres/convex/start variants with versioned deps
import { file, packageJson, tsconfig, codeScripts, type TemplateFile } from "../../shared.js";
import { databasePackage, startDatabaseFiles } from "../../database.js";
import { convexDatabaseFiles, convexStartDatabaseFiles } from "../../database/convex.js";
import type { AddonInstallerMap, DatabaseProvider } from "../../../lib/addons.js";
import { hasAddon } from "../../../lib/addons.js";
import * as v from "../../versions.js";

type Runtime = "node" | "bun";

export function databaseComposerFiles(
  projectName: string,
  runtime: Runtime,
  addons?: AddonInstallerMap,
  database?: DatabaseProvider,
): TemplateFile[] {
  const isConvex = database === "convex" || Boolean(addons && hasAddon(addons, "convex"));

  if (isConvex) {
    return [...convexDatabaseFiles(projectName, runtime), ...convexStartDatabaseFiles(projectName)];
  }

  if (database === "none") {
    // Database disabled — emit a stub @repo/database so @repo/auth and other
    // consumers still typecheck. The stub exports the same symbols (db, users,
    // etc.) but throws at runtime with a clear message guiding to --database
    // postgres|convex. Without this, `import { db } from "@repo/database"` in
    // packages/auth/src/index.ts is TS2307 and the whole project fails to
    // typecheck (generation-matrix invariant).
    return databaseStubPackage(runtime);
  }

  return [...databasePackage(projectName, runtime), ...startDatabaseFiles(projectName)];
}

function databaseStubPackage(runtime: Runtime): TemplateFile[] {
  const executor = runtime === "bun" ? "bun" : "node";
  return [
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
          "@repo/config": "workspace:*",
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
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
          rootDir: "./src",
          declaration: true,
        },
      }),
    ),
    file(
      "packages/database/src/index.ts",
      `// database=none stub — no real DB configured.
// This file exists so imports like \`import { db, users } from "@repo/database"\`
// still resolve when --database none. Any actual DB call will throw with a
// clear message guiding to enable postgres or convex.
export const db: any = new Proxy({} as unknown as Record<string, unknown>, {
  get() { throw new Error("[ghostinit] database is disabled (--database none). Enable --database postgres or convex to use @repo/database."); },
});
export const pool: any = db;
export const users: any = {};
export const accounts: any = {};
export const sessions: any = {};
export const verifications: any = {};
export const twoFactor: any = {};
export const posts: any = {};
export * from "./schema/index.js";
`,
    ),
    file(
      "packages/database/src/schema/index.ts",
      `// stub schema — re-exports empty for database=none
export const users: any = {};
export const accounts: any = {};
export const sessions: any = {};
export const verifications: any = {};
export const twoFactor: any = {};
export const posts: any = {};
export const products: any = {};
export const customers: any = {};
export const subscriptions: any = {};
export const checkouts: any = {};
export const invoices: any = {};
export const license_keys: any = {};
export const usage_events: any = {};
export const webhook_events: any = {};
`,
    ),
    file(
      "packages/database/src/schema/auth.ts",
      `export const users: any = {};
export const accounts: any = {};
export const sessions: any = {};
export const verifications: any = {};
export const twoFactor: any = {};
`,
    ),
    file(
      "packages/database/src/schema/posts.ts",
      `export const posts: any = {};
`,
    ),
    file(
      "packages/database/src/schema/billing.ts",
      `export const products: any = {};
export const customers: any = {};
export const subscriptions: any = {};
export const checkouts: any = {};
export const invoices: any = {};
export const license_keys: any = {};
export const usage_events: any = {};
export const webhook_events: any = {};
`,
    ),
    file(
      "packages/database/src/schema/enums.ts",
      `export const billingProviderEnum: any = {};
export const subscriptionStatusEnum: any = {};
export const checkoutStatusEnum: any = {};
export const invoiceStatusEnum: any = {};
export const licenseKeyStatusEnum: any = {};
export const recurringIntervalEnum: any = {};
`,
    ),
  ];
}
