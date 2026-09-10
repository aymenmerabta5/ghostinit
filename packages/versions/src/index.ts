/**
 * GhostInit Dependency Version Registry
 *
 * Single source of truth for exact dependency versions used in generated
 * projects. CLI code must import from this registry when writing package.json
 * and config files so we never accidentally publish floating versions.
 *
 * Versions were researched from official npm registry, project docs, and the
 * Registry and compatibility checks are enforced by `bun run check:versions`.
 */

export const ghostinitVersion = "0.1.0" as const;

export interface SupplyChainPolicy {
  readonly minimumReleaseAgeSeconds: number;
}

/** Minimum npm package age accepted by generated and host installs. */
export const supplyChain = {
  minimumReleaseAgeSeconds: 604800,
} as const satisfies SupplyChainPolicy;

export const runtime = {
  bun: "1.4.0",
  node: "24.19.0", // LTS target; do not replace with the current non-LTS Node line
  // Match the selected Node LTS line even though DefinitelyTyped's latest tag follows Node 26.
  "@types/node": "24.13.3",
  "server-only": "0.0.1",
} as const;

export const typescript = {
  typescript: "7.0.2",
} as const;

export const nextStack = {
  next: "16.3.3",
  react: "19.2.8",
  "react-dom": "19.2.8",
  "@types/react": "19.2.18",
  "@types/react-dom": "19.2.5",
} as const;

/** Expo SDK 57's React line, kept separate from the npm-latest web stack. */
export const expoReact = {
  react: "19.2.3",
  "react-dom": "19.2.3",
  "@types/react": "19.2.18",
} as const;

export const database = {
  "drizzle-orm": "0.45.2",
  "drizzle-kit": "0.31.10",
  pg: "8.23.0",
  "@types/pg": "8.23.1",
} as const;

export const convex = {
  // The templates are written against the 0.12.x API surface: `convexAdapter`,
  // `createClient`, `createApi`, the `/auth-config`, `/client/plugins`, `/react`
  // and `/react-start` subpaths, and `convexBetterAuthNextJs` from `/nextjs`.
  // NONE of those exist in 0.8.7 — that mismatch made every Convex project fail
  // at module load, and `convex deploy` fail on a missing `/auth-config` subpath.
  //
  // @convex-dev/better-auth@0.12.5 peers on convex ^1.25.0 and
  // better-auth >=1.6.11 <1.7.0 (we pin the latest compatible 1.6.x). convex 1.23.0 additionally
  // lacked the `compareValues` export the component imports at module top level.
  convex: "1.45.0",
  "@convex-dev/better-auth": "0.12.5",
} as const;

export const auth = {
  "better-auth": "1.6.30",
  "@better-auth/core": "1.6.30",
  // Passkeys moved to a dedicated official package in Better Auth 1.6.
  // Keep this exact pin aligned with better-auth so their plugin types agree.
  "@better-auth/passkey": "1.6.30",
  // Expo client plugin — must track the better-auth version above.
  "@better-auth/expo": "1.6.30",
} as const;

export const orpc = {
  "@orpc/server": "1.15.0",
  "@orpc/contract": "1.15.0",
  "@orpc/client": "1.15.0",
  "@orpc/openapi": "1.15.0",
  "@orpc/react-query": "1.15.0",
  "@orpc/zod": "1.15.0",
  // NOTE: @orpc/next is intentionally omitted. Its latest 1.14.11 release is
  // deprecated as an accidental v2 publish and points to an unpublished
  // 1.14.12. GhostInit uses RPCHandler route handlers directly and keeps
  // Server Actions as plain Next.js actions.
} as const;

export const validation = {
  zod: "4.4.3",
  "@t3-oss/env-nextjs": "0.13.11",
  // env-core is used for TanStack Start, where the public prefix is VITE_ rather
  // than the NEXT_PUBLIC_ that env-nextjs hardcodes.
  "@t3-oss/env-core": "0.13.11",
} as const;

export const tanstack = {
  "@tanstack/react-query": "5.102.3",
  "@tanstack/react-form": "1.33.5",
  // Keep every package that owns QueryClient types on the React Query line.
  // Mismatched private fields make QueryClient nominally incompatible.
  "@tanstack/query-async-storage-persister": "5.102.3",
  "@tanstack/query-persist-client-core": "5.102.3",
} as const;

export const tanstackStart = {
  "@tanstack/react-start": "1.168.49",
  "@tanstack/react-router": "1.170.32",
  "@tanstack/react-router-ssr-query": "1.167.1",
  "@tanstack/router-plugin": "1.168.35",
  // `tsr generate` writes src/routeTree.gen.ts. Without it a freshly generated
  // TanStack project cannot typecheck: every createFileRoute("/path") call has no
  // route tree to resolve against. The codegen packages lag react-router's line;
  // 1.167.x is the newest published.
  "@tanstack/router-cli": "1.167.33",
  "@tanstack/react-router-devtools": "1.167.1",
  // Nitro's current release is prerelease-labelled but supports both Vite 7 and
  // Vite 8 and carries the maintained h3 line. Its config and WebSocket runtime
  // APIs differ from 3.0.0, so keep this pin coupled to the generated Nitro
  // config/runtime compatibility tests.
  vite: "7.3.6",
  "@vitejs/plugin-react": "5.2.0",
  nitro: "3.0.260610-beta",
  "@tailwindcss/vite": "4.3.3",
  "vite-tsconfig-paths": "6.1.1",
} as const;

/**
 * Cloudflare Worker deployment tooling. These are the newest stable releases
 * admitted by the repository's seven-day release-age snapshot.
 */
export const cloudflare = {
  "@opennextjs/cloudflare": "1.20.2",
  "@opennextjs/aws": "4.1.0",
  "@cloudflare/vite-plugin": "1.53.1",
  // GHSA-rgj7-g3m4-5g8c: Miniflare's exact 0.35.2 pin needs the patched decoder.
  sharp: "0.35.4",
  dotenv: "17.4.2",
  wrangler: "4.125.0",
} as const;

export const styling = {
  tailwindcss: "4.3.3",
  "@tailwindcss/postcss": "4.3.3",
  postcss: "8.5.26",
  autoprefixer: "10.5.4", // only used if legacy pipeline required
} as const;

export const ui = {
  "@fontsource-variable/geist": "5.3.0",
  "@fontsource-variable/geist-mono": "5.3.0",
  "@fontsource-variable/noto-sans-arabic": "5.3.0",
  shadcn: "4.19.0",
  "@base-ui/react": "1.7.0",
  "lucide-react": "1.34.0",
  clsx: "2.1.1",
  "tailwind-merge": "3.6.0",
  "class-variance-authority": "0.7.1",
  sonner: "2.0.8",
  recharts: "3.10.1",
  "react-is": "19.2.8",
  "@types/react-is": "19.2.0",
  "next-themes": "0.4.6",
} as const;

export const tooling = {
  // NOTE: no `biome` entry. This toolchain uses oxlint + oxfmt; the old
  // `biome: "2.5.3"` pin referenced the unscoped `biome` package on npm, which is
  // an unrelated project (Biome ships as @biomejs/biome), and nothing consumed it.
  oxlint: "1.80.0",
  oxfmt: "0.65.0",
  turbo: "2.10.11",
  husky: "9.1.7",
  // oxc-parser is breaking-change-prone (AST shape changes across minor).
  // Pin to exact version, no ^. Parser extraction in src/lib/architecture/parsers/imports.ts
  // must tolerate shape changes via defensive checks; only that file needs update on bump.
  "oxc-parser": "0.147.0",
} as const;

export const testing = {
  "@electric-sql/pglite": "0.5.7",
  "@electric-sql/pglite-socket": "0.2.10",
  playwright: "1.62.1",
} as const;

export const eve = {
  eve: "0.44.4",
  ai: "7.0.79",
  "just-bash": "3.4.2",
  "@vercel/connect": "1.0.0",
} as const;

export const billing = {
  stripe: "22.5.0",
  "@chargily/chargily-pay": "2.1.0",
  "@paddle/paddle-node-sdk": "3.10.0",
  "@paddle/paddle-js": "1.6.5",
  "@polar-sh/sdk": "0.49.0",
  "@polar-sh/nextjs": "0.9.6",
} as const;

export const analytics = {
  // Both were previously pinned to versions that do not exist on npm
  // (posthog-js 1.233.2, posthog-node 4.20.1), so `bun install` failed in every
  // generated project. Every replacement below is registry-validated; Node 5's
  // native-fetch/GZip transport requires the generated analytics runtime gate.
  "posthog-js": "1.419.0",
  "posthog-node": "5.51.2",
  "posthog-react-native": "4.64.2",
} as const;

export const email = {
  resend: "6.22.1",
  // React Email 6 consolidates components, rendering, and Tailwind exports.
  // The former components/tailwind packages are deprecated on npm.
  "react-email": "6.9.2",
} as const;

export const cache = {
  "@upstash/redis": "1.38.2",
} as const;

export const electron = {
  electron: "44.0.0",
  "electron-vite": "5.0.0",
  // npm's `latest` tag lags at 26.15.3; `v26` is the maintained stable line.
  "electron-builder": "26.15.7",
  "electron-updater": "6.8.9",
  "electron-store": "11.0.2",
} as const;

export const i18n = {
  "next-intl": "4.13.7",
} as const;

export const pdf = {
  "@react-pdf/renderer": "4.8.1",
  "dejavu-fonts-ttf": "2.37.3",
  pdfkit: "0.20.1",
  qrcode: "1.5.4",
  "@types/qrcode": "1.5.6",
} as const;

export const interactive = {
  // Must match the host package.json. Clack 1.x is ESM-only; the CLI loads it
  // lazily through a native dynamic import.
  "@clack/prompts": "1.7.0",
} as const;

export const postgresDocker = {
  image: "postgres:18.6",
} as const;

export const expo = {
  // Keep this matrix on Expo SDK 57's compatibility ranges while selecting
  // releases that satisfy the supply-chain age policy. Native manifests use
  // exact/tilde ranges rather than generic carets so independently released
  // packages do not drift onto incompatible React Native/Reanimated/Worklets lines.
  expo: "57.0.16",
  "@expo/metro-runtime": "57.0.13",
  "expo-constants": "57.0.14",
  "expo-device": "57.0.1",
  "expo-file-system": "57.0.5",
  "expo-linking": "57.0.7",
  "expo-router": "57.0.16",
  "expo-network": "57.0.1",
  "expo-secure-store": "57.0.1",
  "expo-sharing": "57.0.15",
  "expo-status-bar": "57.0.1",
  "expo-web-browser": "57.0.2",
  "expo-clipboard": "57.0.1",
  "expo-notifications": "57.0.14",
  "expo-updates": "57.0.17",
  "expo-localization": "57.0.1",
  "@react-native-async-storage/async-storage": "2.2.0",
  "@react-native-community/netinfo": "12.0.1",
  "react-native": "0.86.3",
  "react-native-safe-area-context": "5.7.0",
  "react-native-screens": "4.26.2",
  "react-native-gesture-handler": "2.32.0",
  "react-native-web": "0.21.2",
  "babel-preset-expo": "57.0.8",
} as const;

export const reanimated = {
  "react-native-reanimated": "4.5.1",
} as const;

export const worklets = {
  "react-native-worklets": "0.10.1",
} as const;

export const uniwind = {
  uniwind: "1.11.0",
  "tailwind-variants": "3.3.1",
  "tw-animate-css": "1.4.0",
} as const;

export const realtime = {
  ws: "8.21.3",
  "@types/ws": "8.18.1",
  crossws: "0.4.12",
} as const;

export const storage = {
  "@aws-sdk/client-s3": "3.1117.0",
} as const;

export const catalog = {
  ...runtime,
  ...typescript,
  ...expoReact,
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
