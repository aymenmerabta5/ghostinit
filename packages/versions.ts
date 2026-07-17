/**
 * GhostInit Dependency Version Registry
 *
 * Single source of truth for exact dependency versions used in generated
 * projects. CLI code must import from this registry when writing package.json
 * and config files so we never accidentally publish floating versions.
 *
 * Versions were researched from official npm registry, project docs, and the
 * Context7 MCP on 2026-07-12. See `docs/RESEARCH.md` for details.
 */

export const ghostinitVersion = "0.1.0" as const;

export const runtime = {
  bun: "1.3.14",
  node: "24.18.0", // LTS target; local has v25.8.0 (EOL) for development only
  "@types/node": "22.20.1",
} as const;

export const typescript = {
  typescript: "7.0.2",
  // Keep the 6.x line available only for tools that still need the legacy
  // programmatic compiler API. GhostInit itself does not use it by default.
  typescriptLegacy: "6.0.3",
  "@typescript/native-preview": "7.0.0-dev.20260707.2",
} as const;

export const nextStack = {
  next: "16.2.10",
  react: "19.2.7",
  "react-dom": "19.2.7",
  "@types/react": "19.2.17",
  "@types/react-dom": "19.2.3",
} as const;

export const database = {
  "drizzle-orm": "0.45.2",
  "drizzle-kit": "0.31.10",
  pg: "8.22.0",
  "@types/pg": "8.11.14", // latest stable at research time; verify in spike
} as const;

export const auth = {
  "better-auth": "1.6.23",
} as const;

export const orpc = {
  "@orpc/server": "1.14.7",
  "@orpc/contract": "1.14.7",
  "@orpc/client": "1.14.7",
  "@orpc/openapi": "1.14.7",
  "@orpc/react-query": "1.14.7",
  "@orpc/zod": "1.14.7",
  // NOTE: @orpc/next is intentionally omitted. The 0.27.0 release peers with
  // @orpc/server 0.27.0, which conflicts with the stable 1.14.7 core line.
  // GhostInit exposes oRPC via RPCHandler route handlers and keeps Server
  // Actions as plain Next.js actions.
} as const;

export const validation = {
  zod: "4.4.3",
  "@t3-oss/env-nextjs": "0.13.11",
} as const;

export const tanstack = {
  "@tanstack/react-query": "5.101.2",
  "@tanstack/react-form": "1.33.1",
} as const;

export const styling = {
  tailwindcss: "4.3.2",
  "@tailwindcss/postcss": "4.3.2",
  postcss: "8.5.17",
  autoprefixer: "10.5.2", // only used if legacy pipeline required
} as const;

export const ui = {
  shadcn: "4.13.0",
  "@base-ui/react": "1.6.0",
  clsx: "2.1.1",
  "tailwind-merge": "3.6.0",
  "class-variance-authority": "0.7.1",
} as const;

export const tooling = {
  biome: "2.5.3",
  oxlint: "1.73.0",
  oxfmt: "0.58.0",
  turbo: "2.10.4",
} as const;

export const testing = {
  playwright: "1.61.1",
} as const;

export const postgresDocker = {
  image: "postgres:18.4",
} as const;

export const catalog = {
  ...runtime,
  ...typescript,
  ...nextStack,
  ...database,
  ...auth,
  ...orpc,
  ...validation,
  ...tanstack,
  ...styling,
  ...ui,
  ...tooling,
  ...testing,
} as const;

export type CatalogPackage = keyof typeof catalog;
