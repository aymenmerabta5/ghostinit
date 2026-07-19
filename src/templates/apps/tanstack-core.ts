/**
 * TanStack Start core template — Deduplicated via fragments/css + fragments/core
 * Production-ready files for TanStack Start with Vite.
 * Context7 verified: /websites/tanstack_start_framework_react
 */

import { codeScripts, file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import { globalCssContent } from "./fragments/css.js";
import { viteSecurityHeaders, postcssConfigContent } from "./fragments/core.js";

type FeatureInput = boolean | AddonInstallerMap | Record<string, { inUse: boolean }>;

function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  return Boolean((input as any)?.[feature]?.inUse);
}

function resolveHasEve(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "eve");
}

function resolveHasI18n(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "i18n");
}

export function tanstackCoreFiles(
  runtime: "node" | "bun" = "bun",
  hasEveInput: FeatureInput = false,
  hasI18nInput: FeatureInput = false,
): TemplateFile[] {
  const hasEve = resolveHasEve(hasEveInput);
  const hasI18n = resolveHasI18n(hasI18nInput ?? hasEveInput);
  const effectiveHasI18n = typeof hasEveInput !== "boolean" ? resolveHasI18n(hasEveInput) : hasI18n;
  return [
    webPackageTanstack(runtime, hasEve, effectiveHasI18n, "tanstack-start"),
    viteConfig(hasEve, effectiveHasI18n),
    nitroConfig(),
    routerFile(),
    globalCss(),
    postcssConfig(),
    tsconfigTanstack(),
  ];
}

function webPackageTanstack(
  runtime: "node" | "bun",
  hasEve = false,
  _hasI18n = false,
  _framework: string = "tanstack-start",
): TemplateFile {
  return file(
    "apps/web/package.json",
    packageJson({
      name: "web",
      type: "module",
      packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
      scripts: {
        dev: "vite dev --port 3000",
        build: "vite build",
        start: "node .output/server/index.mjs",
        ...codeScripts({
          test: runtime === "bun" ? "bun test tests" : "npm run test:unit",
          e2e: true,
        }),
      },
      dependencies: {
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        "@repo/analytics": "workspace:*",
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
        sonner: `^${v.ui.sonner}`,
        recharts: `^${v.ui.recharts}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        ...(hasEve ? { eve: `^${v.eve.eve}` } : {}),
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        zod: `^${v.validation.zod}`,
      },
      devDependencies: {
        "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
        "@playwright/test": `^${v.testing.playwright}`,
        vite: `^${v.tanstackStart.vite}`,
        "@vitejs/plugin-react": `^${v.tanstackStart["@vitejs/plugin-react"]}`,
        "@tailwindcss/vite": `^${v.tanstackStart["@tailwindcss/vite"]}`,
        nitro: `^${v.tanstackStart.nitro}`,
        nitropack: `^${v.tanstackStart.nitro}`,
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

function viteConfig(_hasEve = false, _hasI18n = false): TemplateFile {
  return file(
    "apps/web/vite.config.ts",
    `import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
      router: {
        routesDirectory: 'routes',
      },
    }),
    nitro({
      preset: 'bun',
      routeRules: {
${viteSecurityHeaders()}
      },
    }),
    viteReact(),
  ],
})
`,
  );
}

function nitroConfig(): TemplateFile {
  return file(
    "apps/web/nitro.config.ts",
    `import { defineNitroConfig } from 'nitropack/config'

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

function tsconfigTanstack(): TemplateFile {
  return file(
    "apps/web/tsconfig.json",
    JSON.stringify(
      {
        extends: "@repo/typescript-config/tanstack.json",
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          lib: ["ES2024", "DOM", "DOM.Iterable"],
          baseUrl: ".",
          paths: {
            "~/*": ["./src/*"],
            "@/*": ["./src/*"],
            "@repo/*": ["../../packages/*/src"],
          },
          noEmit: true,
          incremental: true,
          types: ["bun-types", "node"],
        },
        include: ["src/**/*", "vite.config.ts"],
        exclude: ["node_modules", ".output", "dist"],
      },
      null,
      2,
    ) + "\n",
  );
}

export { webPackageTanstack, viteConfig, routerFile, globalCss };
