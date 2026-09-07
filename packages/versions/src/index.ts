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
  bun: "1.4.0",
  node: "24.18.0", // LTS target; local has v25.8.0 (EOL) for development only
  "@types/node": "22.20.1",
  "server-only": "0.0.1",
} as const;

export const typescript = {
  // Fix: TS7 Go port breaks Next 16.2.10 (no lib/typescript.js) -> "It looks like you're trying to use TypeScript but do not have required package(s) installed"
  // + npm fallback fails on workspace:* -> "Unsupported URL Type workspace:*"
  // Use TS6 for stable bun dev. TS7 can be opt-in via @typescript/native + useTypeScriptCli when Next stable supports it (PR #95639)
  // User requested bun not npm - root cause is TS7 detection failure triggers npm install path
  typescript: "6.0.3",
  typescriptLegacy: "5.9.2",
  "@typescript/native-preview": "7.0.0-dev.20260707.2",
} as const;

export const nextStack = {
  next: "16.2.10",
  react: "19.2.8",
  "react-dom": "19.2.8",
  "@types/react": "19.2.18",
  "@types/react-dom": "19.2.4",
} as const;

export const database = {
  "drizzle-orm": "0.45.2",
  "drizzle-kit": "0.31.10",
  pg: "8.22.0",
  "@types/pg": "8.11.14", // latest stable at research time; verify in spike
} as const;

export const convex = {
  // The templates are written against the 0.12.x API surface: `convexAdapter`,
  // `createClient`, `createApi`, the `/auth-config`, `/client/plugins`, `/react`
  // and `/react-start` subpaths, and `convexBetterAuthNextJs` from `/nextjs`.
  // NONE of those exist in 0.8.7 — that mismatch made every Convex project fail
  // at module load, and `convex deploy` fail on a missing `/auth-config` subpath.
  //
  // @convex-dev/better-auth@0.12.5 peers on convex ^1.25.0 and
  // better-auth >=1.6.11 <1.7.0 (we pin 1.6.23). convex 1.23.0 additionally
  // lacked the `compareValues` export the component imports at module top level.
  convex: "1.42.3",
  "@convex-dev/better-auth": "0.12.5",
} as const;

export const auth = {
  "better-auth": "1.6.23",
  "@better-auth/passkey": "1.6.23",
  // Expo client plugin — must track the better-auth version above.
  "@better-auth/expo": "1.6.23",
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
  // env-core is used for TanStack Start, where the public prefix is VITE_ rather
  // than the NEXT_PUBLIC_ that env-nextjs hardcodes.
  "@t3-oss/env-core": "0.13.11",
} as const;

export const tanstack = {
  "@tanstack/react-query": "5.101.2",
  "@tanstack/react-form": "1.33.1",
  "@tanstack/query-async-storage-persister": "5.90.1",
  "@tanstack/query-persist-client-core": "5.90.1",
} as const;

export const tanstackStart = {
  "@tanstack/react-start": "1.168.30",
  "@tanstack/react-router": "1.170.18",
  "@tanstack/router-plugin": "1.168.22",
  // `tsr generate` writes src/routeTree.gen.ts. Without it a freshly generated
  // TanStack project cannot typecheck: every createFileRoute("/path") call has no
  // route tree to resolve against. The codegen packages lag react-router's line;
  // 1.167.x is the newest published.
  "@tanstack/router-cli": "1.167.21",
  "@tanstack/react-router-devtools": "1.167.0",
  vite: "7.3.6",
  "vite-tsconfig-paths": "6.1.1",
  "@vitejs/plugin-react": "5.2.0",
  nitro: "3.0.0",
  "@tailwindcss/vite": "4.3.3",
} as const;

export const cloudflare = {
  // This release supports the pinned Next.js 16.2.x adapter API.
  "@opennextjs/cloudflare": "1.19.9",
  "@cloudflare/vite-plugin": "1.54.3",
  wrangler: "4.128.0",
} as const;

export const styling = {
  tailwindcss: "4.3.3",
  "@tailwindcss/postcss": "4.3.3",
  postcss: "8.5.17",
  autoprefixer: "10.5.2", // only used if legacy pipeline required
} as const;

export const ui = {
  shadcn: "4.13.0",
  "@base-ui/react": "1.6.0",
  clsx: "2.1.1",
  "tailwind-merge": "3.6.0",
  "class-variance-authority": "0.7.1",
  sonner: "1.7.0",
  recharts: "2.12.0",
  "next-themes": "0.4.6",
  "lucide-react": "1.39.0",
  motion: "13.2.0",
} as const;

export const tooling = {
  // NOTE: no `biome` entry. This toolchain uses oxlint + oxfmt; the old
  // `biome: "2.5.3"` pin referenced the unscoped `biome` package on npm, which is
  // an unrelated project (Biome ships as @biomejs/biome), and nothing consumed it.
  oxlint: "1.73.0",
  oxfmt: "0.58.0",
  turbo: "2.10.4",
  husky: "9.1.7",
  // oxc-parser is breaking-change-prone (AST shape changes across minor).
  // Pin to exact version, no ^. Parser extraction in src/lib/architecture/parsers/imports.ts
  // must tolerate shape changes via defensive checks; only that file needs update on bump.
  "oxc-parser": "0.139.0",
} as const;

export const testing = {
  playwright: "1.61.1",
} as const;

export const eve = {
  eve: "0.24.6",
  ai: "7.0.26",
  "@vercel/connect": "0.2.2",
} as const;

export const billing = {
  stripe: "19.1.0",
  "@chargily/chargily-pay": "2.1.0",
  "@paddle/paddle-node-sdk": "3.8.0",
  "@paddle/paddle-js": "1.6.4",
  "@polar-sh/sdk": "0.48.1",
  "@polar-sh/nextjs": "0.9.6",
} as const;

export const analytics = {
  // Both were previously pinned to versions that do not exist on npm
  // (posthog-js 1.233.2, posthog-node 4.20.1), so `bun install` failed in every
  // generated project. Pinned to real releases within the same major to keep the
  // client/server APIs the templates are written against.
  "posthog-js": "1.239.1",
  "posthog-node": "4.18.0",
  "posthog-react-native": "4.6.0",
} as const;

export const email = {
  resend: "6.18.1",
  "@react-email/components": "1.0.12",
  "@react-email/render": "2.1.0",
  "@react-email/tailwind": "2.0.7",
} as const;

export const cache = {
  "@upstash/redis": "1.35.0",
} as const;

export const electron = {
  electron: "41.5.0",
  "electron-vite": "3.1.0",
  "electron-builder": "26.15.6",
  "electron-updater": "6.6.2",
  "electron-store": "8.2.0",
} as const;

/**
 * @deprecated - DEPRECATED: Elysia removed, pure oRPC only.
 * Kept for backwards compatibility / reference, not emitted in templates.
 * File src/templates/backend/elysia.ts returns [] and is not used by monorepoFiles/singleFiles.
 * Spec non-negotiable oRPC contract-first, no websocket double RPC duplication treaty<App> vs @orpc/client.
 * Raw body webhooks handled via Next.js route handlers (single port) Buffer.from(await request.arrayBuffer()).
 * Catalog still spreads ...backend for backwards compat but consumers should NOT use elysia.
 * If you need to remove from bundle size, filter backend out of catalog in your own fork.
 * See docs/RESEARCH.md Pure oRPC Only - Elysia Removed Decision (2026-07-18).
 */
export const backend = {
  elysia: "1.2.0",
  "@elysiajs/cors": "1.2.0",
  "@elysiajs/swagger": "1.2.0",
} as const;

export const i18n = {
  "next-intl": "4.0.0",
} as const;

export const pdf = {
  "@react-pdf/renderer": "4.3.2",
  "dejavu-fonts-ttf": "2.37.3",
  qrcode: "1.5.4",
  "@types/qrcode": "1.5.6",
} as const;

export const interactive = {
  // Must match the host package.json — 0.8.3 was never published.
  "@clack/prompts": "0.8.2",
} as const;

export const postgresDocker = {
  image: "postgres:18.4",
} as const;

export const expo = {
  expo: "54.0.13",
  "@expo/metro-runtime": "6.1.2",
  "expo-constants": "18.0.9",
  "expo-linking": "8.0.8",
  "expo-router": "6.0.24",
  // Peer of @better-auth/expo. SDK 54 tracks the expo-network 8.x line.
  "expo-network": "8.0.8",
  "expo-secure-store": "15.0.8",
  "expo-status-bar": "3.0.9",
  "expo-web-browser": "15.0.7",
  "expo-clipboard": "8.0.6",
  "expo-notifications": "0.32.11",
  "expo-updates": "0.29.13",
  "expo-localization": "16.0.1",
  "@react-native-community/netinfo": "11.3.1",
  "react-native": "0.81.4",
  "react-native-safe-area-context": "5.4.0",
  "react-native-web": "0.21.1",
  "babel-preset-expo": "54.0.12",
} as const;

export const reanimated = {
  "react-native-reanimated": "4.1.1",
} as const;

export const worklets = {
  "react-native-worklets": "0.5.1",
} as const;

export const uniwind = {
  uniwind: "1.10.0",
  "tailwind-variants": "3.2.2",
  "tw-animate-css": "1.4.0",
} as const;

export const realtime = {
  ws: "8.18.3",
  crossws: "0.3.4",
} as const;

export const storage = {
  "@aws-sdk/client-s3": "3.850.0",
} as const;

export const catalog = {
  ...runtime,
  ...typescript,
  ...nextStack,
  ...database,
  ...convex,
  ...auth,
  ...orpc,
  ...validation,
  ...tanstack,
  ...tanstackStart,
  ...cloudflare,
  ...styling,
  ...ui,
  ...tooling,
  ...testing,
  ...billing,
  ...analytics,
  ...email,
  ...cache,
  ...electron,
  ...backend, // DEPRECATED: kept for backwards compat, not used in generation — use oRPC only
  ...i18n,
  ...pdf,
  ...interactive,
  ...expo,
  ...reanimated,
  ...worklets,
  ...uniwind,
  ...realtime,
  ...storage,
} as const;

export type CatalogPackage = keyof typeof catalog;
