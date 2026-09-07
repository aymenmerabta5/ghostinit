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
import { viteSecurityHeaders, postcssConfigContent } from "./fragments/core.js";
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
      return hasEveInput as unknown as AddonInstallerMap;
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
  const hasCloudflare = Boolean(addonMap && hasAddon(addonMap, "cloudflare"));
  return [
    webPackageTanstack(runtime, hasEve, effectiveHasI18n, "tanstack-start", addonMap),
    viteConfig(hasCloudflare),
    ...(hasCloudflare ? [] : [nitroConfig()]),
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
): TemplateFile {
  const hasCloudflare = Boolean(
    addonMap && hasAddon(addonMap as AddonInstallerMap, "cloudflare"),
  );
  const hasAnalytics = addonMap
    ? hasAddon(addonMap as AddonInstallerMap, "analytics")
    : true;
  return file(
    "apps/web/package.json",
    packageJson({
      name: "web",
      type: "module",
      packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
      scripts: {
        dev: hasCloudflare ? "node scripts/vite-cloudflare.mjs dev" : "vite dev --port 3000",
        build: hasCloudflare ? "node scripts/vite-cloudflare.mjs build" : "vite build",
        start: hasCloudflare ? "vite preview" : "node .output/server/index.mjs",
        ...(hasCloudflare
          ? {
              preview: "node scripts/vite-cloudflare.mjs build && vite preview",
              deploy:
                "node scripts/vite-cloudflare.mjs build --production && wrangler deploy --keep-vars",
              "cf-typegen":
                "wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts",
            }
          : {}),
        ...codeScripts({
          test: runtime === "bun" ? "bun test tests" : "npm run test:unit",
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
        "@repo/auth": "workspace:*",
        "@repo/config": "workspace:*",
        "@repo/contracts": "workspace:*",
        "@repo/database": "workspace:*",
        "@repo/email": "workspace:*",
        "@repo/modules": "workspace:*",
        "@repo/observability": "workspace:*",
        "@repo/ui": "workspace:*",
        "@tanstack/react-start": `^${v.tanstackStart["@tanstack/react-start"]}`,
        "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
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
        "next-themes": `^${v.ui["next-themes"]}`,
        "lucide-react": `^${v.ui["lucide-react"]}`,
        motion: `^${v.ui.motion}`,
        "better-auth": `^${v.auth["better-auth"]}`,
        ...(hasEve ? { eve: `^${v.eve.eve}` } : {}),
        ...(addonMap && hasAddon(addonMap as AddonInstallerMap, "convex")
          ? {
              convex: `^${v.convex.convex}`,
              "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
            }
          : {}),
        // Messaging (postgres) needs WS runtime for crossws/Bun.serve
        ...(addonMap &&
        hasAddon(addonMap as AddonInstallerMap, "messaging") &&
        !hasAddon(addonMap as AddonInstallerMap, "convex")
          ? {
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
              wrangler: `^${v.cloudflare.wrangler}`,
            }
          : { nitro: `^${v.tanstackStart.nitro}` }),
        oxfmt: `^${v.tooling.oxfmt}`,
        oxlint: `^${v.tooling.oxlint}`,
        "@repo/typescript-config": "workspace:*",
        "@types/node": `^${v.runtime["@types/node"]}`,
        "@types/react": `^${v.nextStack["@types/react"]}`,
        "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
        "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
        postcss: `^${v.styling.postcss}`,
        tailwindcss: `^${v.styling.tailwindcss}`,
        typescript: `^${v.typescript.typescript}`,
      },
    }),
  );
}

function viteConfig(hasCloudflare = false): TemplateFile {
  return file(
    "apps/web/vite.config.ts",
    `import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
${hasCloudflare ? "import { cloudflare } from '@cloudflare/vite-plugin'" : "import { nitro } from 'nitro/vite'"}

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
${hasCloudflare ? "    cloudflare({ viteEnvironment: { name: 'ssr' } })," : ""}
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
      router: {
        routesDirectory: 'routes',
      },
    }),
${hasCloudflare ? "" : "    nitro(),"}
    viteReact(),
  ],
})
`,
  );
}

function nitroConfig(): TemplateFile {
  return file(
    "apps/web/nitro.config.ts",
    `import { defineNitroConfig } from 'nitro/config'

export default defineNitroConfig({
  preset: 'bun',
  routeRules: {
${viteSecurityHeaders()}
  },
})
`,
  );
}

function routerFile(): TemplateFile {
  return file(
    "apps/web/src/router.tsx",
    `import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },
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
