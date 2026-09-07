/**
 * Constants — single source for framework, database, vendor sets.
 * <5 imports, no logic.
 */

export const FRAMEWORK_PACKAGES = new Set([
  "react",
  "react-dom",
  "next",
  "drizzle-orm",
  "drizzle-kit",
  "pg",
  "better-auth",
  "@orpc/server",
  "@orpc/client",
  "@orpc/contract",
  "@orpc/openapi",
  "@orpc/react-query",
  "@orpc/zod",
  "@tanstack/react-query",
  "@tanstack/react-form",
  "@tanstack/react-start",
  "@tanstack/react-router",
  "@tanstack/router-plugin",
  "@tanstack/react-router-devtools",
  "@tanstack/start",
  "@tanstack/router",
  "tailwindcss",
  "@tailwindcss/postcss",
  "@tailwindcss/vite",
  "@vitejs/plugin-react",
  "@base-ui/react",
  "vite",
  "nitro",
]);

export const DATABASE_PACKAGES = new Set(["@repo/database", "drizzle-orm", "drizzle-kit", "pg"]);

export const SERVER_ONLY_BILLING_PACKAGES = new Set([
  "@chargily/chargily-pay",
  "stripe",
  "@paddle/paddle-node-sdk",
  "@polar-sh/sdk",
]);

export const VENDOR_ISOLATION_SUBSTRINGS = [
  "stripe",
  "@chargily",
  "@paddle",
  "@polar-sh",
  "/billing/providers/",
  "billing/providers",
];

export const RESERVED_NAMES = new Set([
  "node_modules",
  "dist",
  ".next",
  "ghostinit",
  "api",
  "auth",
  "database",
  "config",
  "ui",
  "observability",
  "contracts",
  "typescript-config",
  "modules",
  "workflows",
]);

export const MAX_VISITED_FILES = 50_000;
export const MAX_VISITED_ENTRIES = 100_000;
export const MAX_WALK_DEPTH = 64;

export const SOURCE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

export const SOURCE_COLLECTION_EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".output",
  "out",
  "coverage",
  ".expo",
  ".vite",
]);
