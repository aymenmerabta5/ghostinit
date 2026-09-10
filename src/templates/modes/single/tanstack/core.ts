import { singleGlobalsCss } from "../core/css.js";
import { eveNitroResolverHooks, eveNitroResolverPreamble } from "../../../eve/config.js";
import {
  tanstackSecurityPolicyDeclaration,
  viteSecurityHeaders as sharedViteSecurityHeaders,
} from "../../../apps/fragments/core/security.js";

export function singleNitroConfigTanstackContent(
  hasWebSocketMessaging = false,
  preset: "bun" | "node-server" | "vercel" = "bun",
  hasEve = false,
  _hasPostgres = true,
  hasConvex = false,
  hasPaddle = false,
): string {
  return [
    "import { defineNitroConfig } from 'nitro/config'",
    ...(hasEve ? eveNitroResolverPreamble(true).trimEnd().split("\n") : []),
    "",
    tanstackSecurityPolicyDeclaration(hasConvex, hasPaddle),
    "",
    "export default defineNitroConfig({",
    hasEve
      ? `  preset: process.env.GHOSTINIT_EVE_RUNTIME === '1' ? (process.env.VERCEL ? 'vercel' : 'node-server') : '${preset}',`
      : `  preset: '${preset}',`,
    ...(hasEve ? eveNitroResolverHooks(true).split("\n") : []),
    ...(hasWebSocketMessaging ? ["  serverDir: 'server',"] : []),
    ...(hasWebSocketMessaging ? ["  experimental: { websocket: true },"] : []),
    ...(hasWebSocketMessaging
      ? [
          "  plugins: [",
          "    './server/plugins/00-nitro-websocket-compat.ts',",
          "    './server/plugins/messaging-outbox.ts',",
          "  ],",
        ]
      : []),
    "  routeRules: {",
    sharedViteSecurityHeaders(hasPaddle),
    "  },",
    "})",
    "",
  ].join("\n");
}

export function viteSecurityHeaders(): string {
  return sharedViteSecurityHeaders();
}

export function singleViteConfigTanstackContent(
  hasWebSocketMessaging = false,
  hasPostgres = true,
  hasCloudflare = false,
): string {
  if (hasCloudflare) {
    return [
      "import { defineConfig } from 'vite'",
      "import { fileURLToPath } from 'node:url'",
      "import { cloudflare } from '@cloudflare/vite-plugin'",
      "import { tanstackStart } from '@tanstack/react-start/plugin/vite'",
      "import viteReact from '@vitejs/plugin-react'",
      "import tailwindcss from '@tailwindcss/vite'",
      "import tsconfigPaths from 'vite-tsconfig-paths'",
      "",
      "export default defineConfig({",
      "  server: { port: 3000 },",
      "  resolve: {",
      "    alias: {",
      "      '@': fileURLToPath(new URL('./src', import.meta.url)),",
      "      'server-only': '@tanstack/react-start/server-only',",
      "    },",
      "  },",
      "  plugins: [",
      "    tailwindcss(),",
      "    cloudflare({ viteEnvironment: { name: 'ssr' } }),",
      "    tsconfigPaths(),",
      "    ...tanstackStart({",
      "      srcDirectory: 'src',",
      "      router: { routesDirectory: 'routes' },",
      "    }),",
      "    viteReact(),",
      "  ],",
      "})",
      "",
    ].join("\n");
  }
  return [
    "import { defineConfig } from 'vite'",
    "import { fileURLToPath } from 'node:url'",
    "",
    `const includeNitroInDev = ${hasWebSocketMessaging};`,
    "const isEveRuntime = process.env.GHOSTINIT_EVE_RUNTIME === '1';",
    "",
    "export default defineConfig(async ({ command }) => {",
    "  if (isEveRuntime) return { plugins: [] };",
    "  const [{ tanstackStart }, { default: viteReact }, { default: tailwindcss }, { nitro }] = await Promise.all([",
    "    import('@tanstack/react-start/plugin/vite'),",
    "    import('@vitejs/plugin-react'),",
    "    import('@tailwindcss/vite'),",
    "    import('nitro/vite'),",
    "  ]);",
    "  return {",
    "  server: {",
    "    port: 3000,",
    "  },",
    "  resolve: {",
    "    alias: {",
    "      '@': fileURLToPath(new URL('./src', import.meta.url)),",
    "      'server-only': '@tanstack/react-start/server-only',",
    "    },",
    "  },",
    ...(hasPostgres ? ["  ssr: { external: ['pg'] },"] : []),
    "  plugins: [",
    "    tailwindcss(),",
    "    ...tanstackStart({",
    "      srcDirectory: 'src',",
    "      router: {",
    "        routesDirectory: 'routes',",
    "      },",
    "    }),",
    "    viteReact(),",
    "    ...(command === 'build' || includeNitroInDev ? [nitro()] : []),",
    "  ],",
    "  };",
    "})",
    "",
  ].join("\n");
}

export function singleRouterTanstackContent(): string {
  return [
    "import { createRouter } from '@tanstack/react-router'",
    "import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'",
    "import { getQueryClient } from './lib/query-client'",
    "import { routeTree } from './routeTree.gen'",
    "",
    "function serializeQueryState(queryClient: QueryClient): string {",
    "  const serialized = JSON.stringify(dehydrate(queryClient, {",
    "    shouldDehydrateMutation: () => false,",
    "  }))",
    "  if (typeof serialized !== 'string') throw new Error('Query state could not be serialized')",
    "  return serialized",
    "}",
    "",
    "function isDehydratedState(value: unknown): value is DehydratedState {",
    "  return Boolean(",
    "    value &&",
    "    typeof value === 'object' &&",
    "    Array.isArray(Reflect.get(value, 'mutations')) &&",
    "    Array.isArray(Reflect.get(value, 'queries')),",
    "  )",
    "}",
    "",
    "function hydrateQueryState(queryClient: QueryClient, serialized: string): void {",
    "  const value: unknown = JSON.parse(serialized)",
    "  if (!isDehydratedState(value)) throw new Error('Invalid dehydrated Query state')",
    "  hydrate(queryClient, value)",
    "}",
    "",
    "export function getRouter() {",
    "  const queryClient = getQueryClient()",
    "",
    "  const router = createRouter({",
    "    routeTree,",
    "    context: {",
    "      queryClient,",
    "    },",
    "    dehydrate: () => ({ queryClientState: serializeQueryState(queryClient) }),",
    "    hydrate: (dehydrated) => hydrateQueryState(queryClient, dehydrated.queryClientState),",
    "    scrollRestoration: true,",
    "    defaultPreload: 'intent',",
    "  })",
    "",
    "  return router",
    "}",
    "",
    "declare module '@tanstack/react-router' {",
    "  interface Register {",
    "    router: ReturnType<typeof getRouter>",
    "  }",
    "}",
    "",
  ].join("\n");
}

export function singleGlobalsCssTanstackContent(): string {
  return singleGlobalsCss();
}

export function singlePostCssTanstackContent(): string {
  return [
    '/** @type {import("postcss-load-config").Config} */',
    "const config = {",
    "  plugins: {",
    '    "@tailwindcss/postcss": {},',
    "  },",
    "};",
    "",
    "export default config;",
    "",
  ].join("\n");
}

export function singleTsConfigTanstackContent(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          lib: ["ES2024", "DOM", "DOM.Iterable"],
          jsx: "react-jsx",
          module: "ESNext",
          moduleResolution: "bundler",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          incremental: true,
          types: ["bun-types/test", "node", "vite/client"],
          paths: {
            "@/*": ["./src/*"],
            "@/server/*": ["./src/server/*"],
            "@/components/*": ["./src/components/*"],
            "@/lib/*": ["./src/lib/*"],
          },
        },
        include: ["src/**/*", "server/**/*", "vite.config.ts", "nitro.config.ts"],
        exclude: ["node_modules", ".output", "dist", ".tanstack"],
      },
      null,
      2,
    ) + "\n"
  );
}

export function singleRootRouteTanstackContent(hasI18n = false): string {
  const localeImports = hasI18n
    ? [
        "import { createServerFn } from '@tanstack/react-start'",
        "import { getRequestHeaders } from '@tanstack/react-start/server'",
        "import { localeMetadata } from '@/lib/i18n'",
        "import { getLocaleFromHeaders } from '@/lib/i18n.server'",
        "import { defaultLocale, localeDirection, type Locale } from '@/i18n/config'",
      ]
    : [];
  const localeServerFunction = hasI18n
    ? [
        "const getRequestLocale = createServerFn({ method: 'GET' }).handler(() => {",
        "  const headers = new Headers()",
        "  getRequestHeaders().forEach((value, key) => headers.set(key, value))",
        "  return getLocaleFromHeaders(headers)",
        "})",
        "",
      ]
    : [];
  const rootDocumentOpen = hasI18n ? "    <RootDocument locale={locale}>" : "    <RootDocument>";
  const providersOpen = hasI18n
    ? "      <AppProviders queryClient={queryClient} initialLocale={locale}>"
    : "      <AppProviders queryClient={queryClient}>";
  const documentSignature = hasI18n
    ? "function RootDocument({ children, locale = defaultLocale }: { children: React.ReactNode; locale?: Locale }) {"
    : "function RootDocument({ children }: { children: React.ReactNode }) {";
  const htmlOpen = hasI18n
    ? "    <html lang={locale} dir={localeDirection[locale]} suppressHydrationWarning>"
    : "    <html lang='en' suppressHydrationWarning>";
  const fallbackDocumentOpen = hasI18n
    ? "    <RootDocument locale={locale}>"
    : "    <RootDocument>";

  return [
    '/// <reference types="vite/client" />',
    "import * as React from 'react'",
    "import {",
    "  Outlet,",
    "  createRootRouteWithContext,",
    "  HeadContent,",
    "  Scripts,",
    "  useRouter,",
    "} from '@tanstack/react-router'",
    "import type { QueryClient } from '@tanstack/react-query'",
    "import { AppProviders } from '@/components/providers'",
    "import { AppShell } from '@/components/app-shell'",
    "import { useStandaloneSurfaceLocale } from '@/lib/translations.standalone'",
    "import { RouteErrorScreen, RouteNotFoundScreen } from '@/features/system/route-fallbacks'",
    "import appCss from '@/styles/app.css?url'",
    ...localeImports,
    "",
    ...localeServerFunction,
    "export const Route = createRootRouteWithContext<{",
    "  queryClient: QueryClient",
    "}>()({",
    ...(hasI18n ? ["  loader: () => getRequestLocale(),"] : []),
    ...(hasI18n ? ["  head: ({ loaderData }) => ({"] : ["  head: () => ({"]),
    "    meta: [",
    "      { charSet: 'utf-8' },",
    "      { name: 'viewport', content: 'width=device-width, initial-scale=1' },",
    ...(hasI18n
      ? [
          "      { title: localeMetadata[loaderData ?? defaultLocale].title },",
          "      { name: 'description', content: localeMetadata[loaderData ?? defaultLocale].description },",
        ]
      : ["      { title: '__PROJECT_NAME__ — GhostInit App' },"]),
    "    ],",
    "    links: [{ rel: 'stylesheet', href: appCss }],",
    "  }),",
    "  errorComponent: RootErrorComponent,",
    "  notFoundComponent: RootNotFoundComponent,",
    "  component: RootComponent,",
    "})",
    "",
    "function RootErrorComponent({ error }: { error: unknown }): React.JSX.Element {",
    "  const router = useRouter()",
    "  const locale = useStandaloneSurfaceLocale()",
    "  void locale",
    "  return (",
    fallbackDocumentOpen,
    "      <RouteErrorScreen error={error} retry={() => { void router.invalidate() }} />",
    "    </RootDocument>",
    "  )",
    "}",
    "",
    "function RootNotFoundComponent(): React.JSX.Element {",
    "  const locale = useStandaloneSurfaceLocale()",
    "  void locale",
    "  return (",
    fallbackDocumentOpen,
    "      <RouteNotFoundScreen />",
    "    </RootDocument>",
    "  )",
    "}",
    "",
    "function RootComponent() {",
    "  const { queryClient } = Route.useRouteContext()",
    ...(hasI18n ? ["  const locale = Route.useLoaderData()"] : []),
    "  return (",
    rootDocumentOpen,
    providersOpen,
    "        <AppShell><Outlet /></AppShell>",
    "      </AppProviders>",
    "    </RootDocument>",
    "  )",
    "}",
    "",
    documentSignature,
    "  return (",
    htmlOpen,
    "      <head>",
    "        <HeadContent />",
    "      </head>",
    "      <body className='antialiased bg-background text-foreground'>",
    "        {children}",
    "        <Scripts />",
    "      </body>",
    "    </html>",
    "  )",
    "}",
    "",
  ].join("\n");
}
