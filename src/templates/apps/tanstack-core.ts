/**
 * TanStack Start core template — Deduplicated via fragments/css + fragments/core
 * Production-ready files for TanStack Start with Vite.
 * Context7 verified: /websites/tanstack_start_framework_react
 */

import { codeScripts, file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";
import { globalCssContent } from "./fragments/css.js";
import {
  postcssConfigContent,
  tanstackSecurityPolicyDeclaration,
  viteSecurityHeaders,
} from "./fragments/core.js";
import { webhookRuntimeDeps } from "./fragments/webhook-deps.js";
import { webUiFiles } from "./fragments/web-ui/index.js";
import { webLibFiles } from "./fragments/web-lib.js";

type FeatureInput =
  | boolean
  | AddonInstallerMap
  | Record<string, { inUse: boolean }>
  | BillingProviderName[];

function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  if (Array.isArray(input)) return false;
  const rec = input as Record<string, { inUse?: boolean }>;
  return Boolean(rec[feature]?.inUse);
}

function resolveHasEve(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "eve");
}

function resolveHasI18n(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "i18n");
}

function resolveAddonMapTanstack(
  hasEveInput: FeatureInput = false,
  explicit?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): AddonInstallerMap | undefined {
  if (explicit) return explicit as AddonInstallerMap;
  if (typeof hasEveInput === "object" && !Array.isArray(hasEveInput)) {
    const rec = hasEveInput as Record<string, unknown>;
    if ("convex" in rec || "postgres" in rec || "eve" in rec || "i18n" in rec) {
      return hasEveInput as AddonInstallerMap;
    }
  }
  return undefined;
}

export function tanstackCoreFiles(
  runtime: "node" | "bun" = "bun",
  hasEveInput: FeatureInput = false,
  hasI18nInput: FeatureInput = false,
  addonMapExplicit?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): TemplateFile[] {
  const hasEve = resolveHasEve(hasEveInput);
  const hasI18n = resolveHasI18n(hasI18nInput ?? hasEveInput);
  const effectiveHasI18n = typeof hasEveInput !== "boolean" ? resolveHasI18n(hasEveInput) : hasI18n;
  const addonMap = resolveAddonMapTanstack(hasEveInput, addonMapExplicit);
  const hasEmail = addonMap ? hasAddon(addonMap, "email") : true;
  const hasPostgres = addonMap ? hasAddon(addonMap, "postgres") : true;
  const hasConvex = addonMap ? hasAddon(addonMap, "convex") : false;
  const hasCloudflare = addonMap ? hasAddon(addonMap, "cloudflare") : false;
  const hasWebSocketMessaging = Boolean(
    addonMap && hasAddon(addonMap, "messaging") && !hasAddon(addonMap, "convex"),
  );
  const nitroPreset =
    addonMap && hasAddon(addonMap, "vercel")
      ? "vercel"
      : runtime === "node"
        ? "node-server"
        : "bun";
  return [
    webPackageTanstack(runtime, hasEve, effectiveHasI18n, "tanstack-start", addonMap, hasEmail),
    viteConfig(hasEve, effectiveHasI18n, hasWebSocketMessaging, hasPostgres, hasCloudflare),
    ...(hasCloudflare
      ? []
      : [
          nitroConfig(
            hasWebSocketMessaging,
            nitroPreset,
            hasConvex,
            Boolean(addonMap && hasAddon(addonMap, "paddle")),
          ),
        ]),
    routerFile(),
    globalCss(),
    postcssConfig(),

    // NOTE: apps/web/tsconfig.json is deliberately NOT emitted here.
    // modes/monorepo/apps-composer.ts owns it and emits the full @repo/* path
    // table plus vite/client types; a thinner copy used to be emitted from this
    // list and lost the composition race silently.

    // The TanStack routes import @/components/ui/* and @/lib/utils exactly like the
    // Next.js pages do, and webUiFiles() already emits under apps/web/src. Omitting
    // it left every TanStack project referencing components that were never
    // generated (TS2307 across the whole app).
    ...webUiFiles(),
    ...webLibFiles("apps/web/src", "tanstack-start"),
  ];
}

function webPackageTanstack(
  runtime: "node" | "bun",
  hasEve = false,
  _hasI18n = false,
  _framework: string = "tanstack-start",
  addonMap?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
  hasEmail = true,
): TemplateFile {
  const hasAuth = addonMap ? hasAddon(addonMap as AddonInstallerMap, "auth") : true;
  const hasPostgres = addonMap ? hasAddon(addonMap as AddonInstallerMap, "postgres") : true;
  const hasCloudflare = Boolean(addonMap && hasAddon(addonMap as AddonInstallerMap, "cloudflare"));
  return file(
    "apps/web/package.json",
    packageJson({
      name: "web",
      type: "module",
      packageManager: `bun@${v.runtime.bun}`,
      scripts: {
        dev: hasCloudflare
          ? "bun --env-file=.dev.vars scripts/cloudflare.mjs dev"
          : "vite dev --port 3000",
        // Cloudflare production builds must not bypass the wrapper's runtime
        // environment isolation, Wrangler dry run, and artifact secret scan.
        build: hasCloudflare ? "bun scripts/cloudflare.mjs build" : "vite build",
        start: hasCloudflare
          ? "bun run preview"
          : runtime === "bun"
            ? "bun .output/server/index.mjs"
            : "node .output/server/index.mjs",
        ...(hasCloudflare
          ? {
              "build:worker": "bun scripts/cloudflare.mjs build",
              preview: "bun --env-file=.dev.vars scripts/cloudflare.mjs preview",
              deploy: "bun scripts/cloudflare.mjs deploy",
              "cloudflare:dry-run": "bun scripts/cloudflare.mjs dry-run",
              "cf-typegen":
                "bun x --no-install wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts",
            }
          : {}),
        ...codeScripts({
          // Package management and tests stay on Bun for both execution runtimes.
          // Scope unit discovery so Playwright e2e specs are never run by bun:test.
          test: "bun test tests",
          e2e: true,
          // src/routeTree.gen.ts is written by the router codegen; every
          // createFileRoute("/path") needs it to resolve, so generate before tsc.
          typecheck: "tsr generate && tsc --noEmit",
        }),
      },
      dependencies: {
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        ...(hasAnalytics ? { "@repo/analytics": "workspace:*" } : {}),
        "@repo/api": "workspace:*",
        ...(hasAuth ? { "@repo/auth": "workspace:*" } : {}),
        "@repo/config": "workspace:*",
        "@repo/contracts": "workspace:*",
        "@repo/database": "workspace:*",
        ...(hasEmail ? { "@repo/email": "workspace:*" } : {}),
        "@repo/kernel": "workspace:*",
        "@repo/modules": "workspace:*",
        "@repo/observability": "workspace:*",
        ...(addonMap && hasAddon(addonMap as AddonInstallerMap, "pdf")
          ? { "@repo/pdf": "workspace:*" }
          : {}),
        ...(hasAuth ? { "@repo/services": "workspace:*" } : {}),
        "@repo/ui": "workspace:*",
        "@tanstack/react-start": `^${v.tanstackStart["@tanstack/react-start"]}`,
        "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
        "@tanstack/react-router-ssr-query": `^${v.tanstackStart["@tanstack/react-router-ssr-query"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        // Required by the shared shadcn-style components emitted via webUiFiles().
        "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
        sonner: `^${v.ui.sonner}`,
        recharts: `^${v.ui.recharts}`,
        "react-is": `^${v.ui["react-is"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        "lucide-react": `^${v.ui["lucide-react"]}`,
        "server-only": `^${v.runtime["server-only"]}`,
        ...(hasPostgres ? { pg: `^${v.database.pg}` } : {}),
        ...(addonMap && hasAddon(addonMap as AddonInstallerMap, "pdf")
          ? {
              "@react-pdf/renderer": `^${v.pdf["@react-pdf/renderer"]}`,
              "dejavu-fonts-ttf": `^${v.pdf["dejavu-fonts-ttf"]}`,
              pdfkit: `^${v.pdf.pdfkit}`,
            }
          : {}),
        ...(hasEve ? { eve: `^${v.eve.eve}` } : {}),
        ...(addonMap && hasAddon(addonMap as AddonInstallerMap, "convex")
          ? {
              convex: `^${v.convex.convex}`,
              ...(hasAuth
                ? { "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}` }
                : {}),
            }
          : {}),
        // Messaging (postgres) needs WS runtime for crossws/Bun.serve
        ...(addonMap &&
        hasAddon(addonMap as AddonInstallerMap, "messaging") &&
        !hasAddon(addonMap as AddonInstallerMap, "convex")
          ? {
              "@repo/realtime": "workspace:*",
              "@repo/storage": "workspace:*",
              "drizzle-orm": `^${v.database["drizzle-orm"]}`,
              ws: `^${v.realtime.ws}`,
              crossws: `^${v.realtime.crossws}`,
            }
          : {}),
        // Webhook routes under src/routes/api/webhooks/* import these directly.
        ...webhookRuntimeDeps(addonMap),
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        zod: `^${v.validation.zod}`,
      },
      devDependencies: {
        "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
        // Provides `tsr generate` for src/routeTree.gen.ts (see typecheck script).
        "@tanstack/router-cli": `^${v.tanstackStart["@tanstack/router-cli"]}`,
        // apps/web tsconfig lists types: ["bun-types", ...] — declare it or TS2688.
        "bun-types": `^${v.runtime.bun}`,
        "@playwright/test": `^${v.testing.playwright}`,
        vite: `^${v.tanstackStart.vite}`,
        "vite-tsconfig-paths": `^${v.tanstackStart["vite-tsconfig-paths"]}`,
        "@vitejs/plugin-react": `^${v.tanstackStart["@vitejs/plugin-react"]}`,
        "@tailwindcss/vite": `^${v.tanstackStart["@tailwindcss/vite"]}`,
        ...(hasCloudflare
          ? {
              "@cloudflare/vite-plugin": `^${v.cloudflare["@cloudflare/vite-plugin"]}`,
              dotenv: `^${v.cloudflare.dotenv}`,
              "vite-tsconfig-paths": `^${v.tanstackStart["vite-tsconfig-paths"]}`,
              wrangler: `^${v.cloudflare.wrangler}`,
            }
          : { nitro: `^${v.tanstackStart.nitro}` }),
        oxfmt: `^${v.tooling.oxfmt}`,
        oxlint: `^${v.tooling.oxlint}`,
        "@repo/typescript-config": "workspace:*",
        "@types/node": `^${v.runtime["@types/node"]}`,
        "@types/react": `^${v.nextStack["@types/react"]}`,
        "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
        "@types/react-is": `^${v.ui["@types/react-is"]}`,
        ...(addonMap && hasAddon(addonMap as AddonInstallerMap, "messaging")
          ? { "@types/ws": `^${v.realtime["@types/ws"]}` }
          : {}),
        "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
        postcss: `^${v.styling.postcss}`,
        tailwindcss: `^${v.styling.tailwindcss}`,
        typescript: `^${v.typescript.typescript}`,
      },
    }),
  );
}

function viteConfig(
  _hasEve = false,
  _hasI18n = false,
  hasWebSocketMessaging = false,
  hasPostgres = true,
  hasCloudflare = false,
): TemplateFile {
  return file(
    "apps/web/vite.config.ts",
    `import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
${hasCloudflare ? "import { cloudflare } from '@cloudflare/vite-plugin'\nimport tsconfigPaths from 'vite-tsconfig-paths'" : "import { nitro } from 'nitro/vite'"}
import { fileURLToPath } from 'node:url'

${hasCloudflare ? "" : `const includeNitroInDev = ${hasWebSocketMessaging};\n`}
export default defineConfig(${hasCloudflare ? "{" : "({ command }) => ({"}
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': '@tanstack/react-start/server-only',
    },
  },
${hasPostgres ? "  ssr: { external: ['pg'] },\n" : ""}  plugins: [
    tailwindcss(),
${hasCloudflare ? "    cloudflare({ viteEnvironment: { name: 'ssr' } }),\n    tsconfigPaths()," : ""}
    ...tanstackStart({
      srcDirectory: 'src',
      router: {
        routesDirectory: 'routes',
      },
    }),
    viteReact(),
${hasCloudflare ? "" : "    ...(command === 'build' || includeNitroInDev ? [nitro()] : []),"}
  ],
${hasCloudflare ? "})" : "}))"}
`,
  );
}

function nitroConfig(
  hasWebSocketMessaging: boolean,
  preset: "bun" | "node-server" | "vercel",
  hasConvex = false,
  hasPaddle = false,
): TemplateFile {
  return file(
    "apps/web/nitro.config.ts",
    `import { defineNitroConfig } from 'nitro/config'

${tanstackSecurityPolicyDeclaration(hasConvex, hasPaddle)}

export default defineNitroConfig({
  preset: '${preset}',
${hasWebSocketMessaging ? "  serverDir: 'server',\n  experimental: { websocket: true },\n  plugins: [\n    './server/plugins/00-nitro-websocket-compat.ts',\n    './server/plugins/messaging-outbox.ts',\n  ],\n" : ""}  routeRules: {
${viteSecurityHeaders(hasPaddle)}
  },
})
`,
  );
}

function routerFile(): TemplateFile {
  return file(
    "apps/web/src/router.tsx",
    `import { createRouter } from '@tanstack/react-router'
import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'
import { getQueryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'

function serializeQueryState(queryClient: QueryClient): string {
  const serialized = JSON.stringify(dehydrate(queryClient, {
    shouldDehydrateMutation: () => false,
  }))
  if (typeof serialized !== 'string') throw new Error('Query state could not be serialized')
  return serialized
}

function isDehydratedState(value: unknown): value is DehydratedState {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(Reflect.get(value, 'mutations')) &&
    Array.isArray(Reflect.get(value, 'queries')),
  )
}

function hydrateQueryState(queryClient: QueryClient, serialized: string): void {
  const value: unknown = JSON.parse(serialized)
  if (!isDehydratedState(value)) throw new Error('Invalid dehydrated Query state')
  hydrate(queryClient, value)
}

export function getRouter() {
  const queryClient = getQueryClient()

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
    dehydrate: () => ({ queryClientState: serializeQueryState(queryClient) }),
    hydrate: (dehydrated) => hydrateQueryState(queryClient, dehydrated.queryClientState),
    scrollRestoration: true,
    defaultPreload: 'intent',
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
`,
  );
}

function globalCss(): TemplateFile {
  return file("apps/web/src/styles/app.css", globalCssContent());
}

function postcssConfig(): TemplateFile {
  return file("apps/web/postcss.config.mjs", postcssConfigContent());
}

export { webPackageTanstack, viteConfig, routerFile, globalCss };
