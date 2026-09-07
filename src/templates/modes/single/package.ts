// @allow-long 560: single-mode package.json dependency matrix across every addon combination — effectively a data table
import { packageJson } from "../../shared.js";
import * as v from "../../versions.js";
import type { BillingProviderName } from "../../../lib/addons.js";
import { jobsAdapterIntegrationGuide } from "../../adapters/jobs/index.js";
import { nodeEngineSelector } from "../../root/deploy.js";
import { customNextServerCommand, nextRuntimeCommand } from "../../root/next-server-runtime.js";
import {
  OPENNEXT_AWS_WINDOWS_PATCH_KEY,
  OPENNEXT_AWS_WINDOWS_PATCH_PATH,
} from "../../root/cloudflare.js";

const LINT_ALL =
  "bun run lint && bun run lint:architecture && bun run lint:rtl && bun run lint:animations && bun run lint:server-only && bun run typecheck";

function drizzleScript(runtime: "node" | "bun", command: "generate" | "migrate" | "push"): string {
  return runtime === "bun"
    ? `bun --env-file=.env.local drizzle-kit ${command}`
    : `node --env-file=.env.local ./node_modules/drizzle-kit/bin.cjs ${command}`;
}

function wireBackendProcessScripts(
  scripts: Record<string, string>,
  runtime: "node" | "bun",
  isConvex: boolean,
  hasMessaging: boolean,
  hasJobs: boolean,
  hasStorage: boolean,
  framework: "nextjs" | "tanstack-start",
): void {
  if (framework === "nextjs" && hasMessaging && !isConvex) {
    scripts.dev = customNextServerCommand(runtime, "dev");
    scripts.start = customNextServerCommand(runtime, "start");
    scripts["build:server"] = customNextServerCommand(runtime, "build");
    scripts.build = `bun run build:server && ${scripts.build}`;
  }
  const database = isConvex ? "convex" : "postgres";
  if (hasJobs) {
    const jobsScripts: Record<string, string> = {
      ...jobsAdapterIntegrationGuide({ mode: "single", database, runtime }).packageScripts,
    };
    Object.assign(scripts, jobsScripts);
  }
  if (!isConvex && (hasJobs || hasStorage)) {
    if (hasJobs) scripts["start:web"] = scripts.start;
    scripts["start:production"] = "bun scripts/start-production.mjs";
  }
}

function buildDeps(
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  isTanstack = false,
  isConvex = false,
  hasMessaging = false,
  hasEmail = true,
  hasApi = true,
  hasAnalytics = true,
  hasAuth = true,
  isNone = false,
): Record<string, string> {
  const baseDatabase: Record<string, string> = isConvex
    ? {
        convex: `^${v.convex.convex}`,
        ...(hasAuth
          ? { "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}` }
          : {}),
      }
    : isNone
      ? {}
      : {
          "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          pg: `^${v.database.pg}`,
        };

  const deps: Record<string, string> = isTanstack
    ? {
        "@tanstack/react-start": `^${v.tanstackStart["@tanstack/react-start"]}`,
        "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
        "@tanstack/react-router-ssr-query": `^${v.tanstackStart["@tanstack/react-router-ssr-query"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        ...(hasAuth ? { "better-auth": `^${v.auth["better-auth"]}` } : {}),
        ...baseDatabase,
        zod: `^${v.validation.zod}`,
        "@t3-oss/env-core": `^${v.validation["@t3-oss/env-core"]}`,
        "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
        sonner: `^${v.ui.sonner}`,
        recharts: `^${v.ui.recharts}`,
        "react-is": `^${v.ui["react-is"]}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        // Required by the shadcn-style components emitted via singleWebUiFiles().
        "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        "lucide-react": `^${v.ui["lucide-react"]}`,
        "server-only": `^${v.runtime["server-only"]}`,
      }
    : {
        next: `^${v.nextStack.next}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        ...(hasAuth ? { "better-auth": `^${v.auth["better-auth"]}` } : {}),
        ...baseDatabase,
        zod: `^${v.validation.zod}`,
        "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
        "@t3-oss/env-core": `^${v.validation["@t3-oss/env-core"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        sonner: `^${v.ui.sonner}`,
        recharts: `^${v.ui.recharts}`,
        "react-is": `^${v.ui["react-is"]}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        // Required by the shadcn-style components emitted via singleWebUiFiles().
        "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        "lucide-react": `^${v.ui["lucide-react"]}`,
        "server-only": `^${v.runtime["server-only"]}`,
      };

  if (hasApi) {
    deps["@orpc/server"] = `^${v.orpc["@orpc/server"]}`;
    deps["@orpc/contract"] = `^${v.orpc["@orpc/contract"]}`;
    deps["@orpc/client"] = `^${v.orpc["@orpc/client"]}`;
    deps["@orpc/react-query"] = `^${v.orpc["@orpc/react-query"]}`;
    deps["@orpc/openapi"] = `^${v.orpc["@orpc/openapi"]}`;
    deps["@orpc/zod"] = `^${v.orpc["@orpc/zod"]}`;
  }
  if (hasAnalytics) {
    deps["posthog-js"] = `^${v.analytics["posthog-js"]}`;
    deps["posthog-node"] = `^${v.analytics["posthog-node"]}`;
  }
  if (hasAuth && !isConvex) {
    deps["@better-auth/core"] = `^${v.auth["@better-auth/core"]}`;
    deps["@better-auth/passkey"] = `^${v.auth["@better-auth/passkey"]}`;
  }

  if (hasEmail) {
    deps["react-email"] = `^${v.email["react-email"]}`;
    deps.resend = `^${v.email.resend}`;
  }

  const has = (n: BillingProviderName) => selectedBilling.includes(n);
  if (has("stripe")) deps.stripe = v.billing.stripe;
  if (has("chargily")) deps["@chargily/chargily-pay"] = `^${v.billing["@chargily/chargily-pay"]}`;
  if (has("paddle")) {
    deps["@paddle/paddle-node-sdk"] = `^${v.billing["@paddle/paddle-node-sdk"]}`;
    deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
  }
  if (has("polar")) {
    deps["@polar-sh/sdk"] = `^${v.billing["@polar-sh/sdk"]}`;
  }
  if (hasEve) {
    deps.eve = `^${v.eve.eve}`;
    deps["just-bash"] = v.eve["just-bash"];
    deps.ai = `^${v.eve.ai}`;
    deps["@vercel/connect"] = `^${v.eve["@vercel/connect"]}`;
  }
  if (hasI18n && !isTanstack) {
    deps["next-intl"] = `^${v.i18n["next-intl"]}`;
  }
  if (hasMessaging && !isConvex) {
    deps.ws = `^${v.realtime.ws}`;
    deps.crossws = `^${v.realtime.crossws}`;
    deps["@aws-sdk/client-s3"] = `^${v.storage["@aws-sdk/client-s3"]}`;
  }
  return deps;
}

export function singlePackageJson(
  projectName: string,
  runtime: "node" | "bun",
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  isConvex = false,
  hasMessaging = false,
  hasEmail = true,
  hasApi = true,
  hasAnalytics = true,
  hasJobs = false,
  hasAuth = true,
  isNone = false,
  hasStorage = false,
  hasCloudflare = false,
  hasPdf = false,
): string {
  const lintAll =
    "oxlint --deny-warnings . && bun scripts/check-import-aliases.cjs && bun scripts/check-next-parity.cjs && bun scripts/check-navigation-imports.cjs";
  const scripts: Record<string, string> = isConvex
    ? {
        dev: nextRuntimeCommand(runtime, "dev", hasPdf),
        build: nextRuntimeCommand(runtime, "build", hasPdf),
        start: nextRuntimeCommand(runtime, "start", hasPdf),
        typecheck: "tsc --noEmit",
        test: "bun test",
        lint: lintAll,
        "lint:oxlint": "oxlint --deny-warnings .",
        "lint:imports": "bun scripts/check-import-aliases.cjs",
        "lint:next-parity": "bun scripts/check-next-parity.cjs",
        "lint:navigation": "bun scripts/check-navigation-imports.cjs",
        "lint:architecture": "bun scripts/check-feature-folder.cjs",
        "lint:rtl": "bun scripts/check-rtl-logical.cjs",
        "lint:animations": "bun scripts/check-animation-imports.cjs",
        "lint:server-only": "bun scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
      }
    : {
        dev: nextRuntimeCommand(runtime, "dev", hasPdf),
        build: nextRuntimeCommand(runtime, "build", hasPdf),
        start: nextRuntimeCommand(runtime, "start", hasPdf),
        typecheck: "tsc --noEmit",
        test: "bun test",
        lint: lintAll,
        "lint:oxlint": "oxlint --deny-warnings .",
        "lint:imports": "bun scripts/check-import-aliases.cjs",
        "lint:next-parity": "bun scripts/check-next-parity.cjs",
        "lint:navigation": "bun scripts/check-navigation-imports.cjs",
        "lint:architecture": "bun scripts/check-feature-folder.cjs",
        "lint:rtl": "bun scripts/check-rtl-logical.cjs",
        "lint:animations": "bun scripts/check-animation-imports.cjs",
        "lint:server-only": "bun scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        ...(isNone
          ? {}
          : {
              "db:generate": drizzleScript(runtime, "generate"),
              "db:migrate": drizzleScript(runtime, "migrate"),
              "db:push": drizzleScript(runtime, "push"),
            }),
      };

  scripts["lint:all"] = LINT_ALL;
  wireBackendProcessScripts(
    scripts,
    runtime,
    isConvex,
    hasMessaging,
    hasJobs,
    hasStorage,
    "nextjs",
  );
  if (hasEve) {
    const webStart = scripts.start;
    scripts["dev:web"] = scripts.dev;
    scripts.dev = "bun scripts/start-development.mjs";
    scripts["build:web"] = scripts.build;
    scripts.build = "bun scripts/build-with-eve.mjs";
    scripts["eve:build"] = "eve build";
    scripts["eve:dev"] = "node scripts/eve-dev.mjs";
    scripts["eve:start"] = "node .output/server/index.mjs";
    scripts["start:web"] = webStart;
    scripts["start:eve"] = "node .output/server/index.mjs";
    scripts["start:production"] = "bun scripts/start-production.mjs";
    scripts.start = "bun --env-file=.env.local run start:production";
  }
  if (hasCloudflare) {
    scripts.dev = "bun --env-file=.dev.vars scripts/cloudflare.mjs dev";
    // Keep the conventional production build on the same fail-closed path as
    // build:worker. OpenNext's internal Next command is configured separately
    // so this does not recurse.
    scripts.build = "bun scripts/cloudflare.mjs build";
    scripts.start = "bun run preview";
    scripts["build:framework"] = nextRuntimeCommand(runtime, "build");
    scripts["build:worker"] = "bun scripts/cloudflare.mjs build";
    scripts.preview = "bun --env-file=.dev.vars scripts/cloudflare.mjs preview";
    scripts.deploy = "bun scripts/cloudflare.mjs deploy";
    scripts.upload = "bun scripts/cloudflare.mjs upload";
    scripts["cloudflare:dry-run"] = "bun scripts/cloudflare.mjs dry-run";
    scripts["cf-typegen"] =
      "bun x --no-install wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts";
    if (isConvex) {
      scripts["convex:bootstrap"] = "bun scripts/cloudflare-convex.mjs bootstrap";
      scripts["convex:dev"] = "bun scripts/cloudflare-convex.mjs dev";
      scripts["convex:deploy"] = "bun scripts/cloudflare-convex.mjs deploy";
      scripts["convex:codegen"] = "bun scripts/cloudflare-convex.mjs codegen";
    }
  }

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    engines: {
      bun: v.runtime.bun,
      ...(runtime === "node" || hasEve ? { node: nodeEngineSelector() } : {}),
    },
    packageManager: `bun@${v.runtime.bun}`,
    scripts,
    dependencies: buildDeps(
      selectedBilling,
      hasEve,
      hasI18n,
      false,
      isConvex,
      hasMessaging,
      hasEmail,
      hasApi,
      hasAnalytics,
      hasAuth,
      isNone,
    ),
    devDependencies: {
      "bun-types": `^${v.runtime.bun}`,
      // Next 16.3 uses this package-local TS7 tsc CLI. Generated lint checks use
      // oxc-parser rather than TypeScript's removed JavaScript compiler API.
      typescript: `^${v.typescript.typescript}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
      "@types/react-is": `^${v.ui["@types/react-is"]}`,
      ...(hasMessaging ? { "@types/ws": `^${v.realtime["@types/ws"]}` } : {}),
      ...(isConvex || isNone ? {} : { "@types/pg": `^${v.database["@types/pg"]}` }),
      ...(isConvex || isNone ? {} : { "drizzle-kit": `^${v.database["drizzle-kit"]}` }),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      "oxc-parser": v.tooling["oxc-parser"],
      tailwindcss: `^${v.styling.tailwindcss}`,
      "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
      postcss: `^${v.styling.postcss}`,
      ...(hasCloudflare
        ? {
            "@opennextjs/cloudflare": `^${v.cloudflare["@opennextjs/cloudflare"]}`,
            dotenv: `^${v.cloudflare.dotenv}`,
            wrangler: `^${v.cloudflare.wrangler}`,
          }
        : {}),
    },
    patchedDependencies: hasCloudflare
      ? { [OPENNEXT_AWS_WINDOWS_PATCH_KEY]: OPENNEXT_AWS_WINDOWS_PATCH_PATH }
      : undefined,
  });
}

export function singlePackageJsonTanstack(
  projectName: string,
  runtime: "node" | "bun",
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  isConvex = false,
  hasMessaging = false,
  hasEmail = true,
  hasApi = true,
  hasAnalytics = true,
  hasJobs = false,
  hasAuth = true,
  isNone = false,
  hasStorage = false,
  hasCloudflare = false,
): string {
  void hasI18n;
  const lintAll =
    "oxlint --deny-warnings . && bun scripts/check-import-aliases.cjs && bun scripts/check-navigation-imports.cjs";
  const scripts: Record<string, string> = isConvex
    ? {
        dev: "vite dev --port 3000",
        build: "vite build",
        start: runtime === "bun" ? "bun .output/server/index.mjs" : "node .output/server/index.mjs",
        typecheck: "tsr generate && tsc --noEmit",
        test: "bun test",
        lint: lintAll,
        "lint:oxlint": "oxlint --deny-warnings .",
        "lint:imports": "bun scripts/check-import-aliases.cjs",
        "lint:architecture": "bun scripts/check-feature-folder.cjs",
        "lint:rtl": "bun scripts/check-rtl-logical.cjs",
        "lint:animations": "bun scripts/check-animation-imports.cjs",
        "lint:server-only": "bun scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
      }
    : {
        dev: "vite dev --port 3000",
        build: "vite build",
        start: runtime === "bun" ? "bun .output/server/index.mjs" : "node .output/server/index.mjs",
        typecheck: "tsr generate && tsc --noEmit",
        test: "bun test",
        lint: lintAll,
        "lint:oxlint": "oxlint --deny-warnings .",
        "lint:imports": "bun scripts/check-import-aliases.cjs",
        "lint:architecture": "bun scripts/check-feature-folder.cjs",
        "lint:rtl": "bun scripts/check-rtl-logical.cjs",
        "lint:animations": "bun scripts/check-animation-imports.cjs",
        "lint:server-only": "bun scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        ...(isNone
          ? {}
          : {
              "db:generate": drizzleScript(runtime, "generate"),
              "db:migrate": drizzleScript(runtime, "migrate"),
              "db:push": drizzleScript(runtime, "push"),
            }),
      };

  scripts["lint:all"] = LINT_ALL;
  wireBackendProcessScripts(
    scripts,
    runtime,
    isConvex,
    hasMessaging,
    hasJobs,
    hasStorage,
    "tanstack-start",
  );
  if (hasEve) {
    const webStart = scripts.start;
    scripts["build:web"] = scripts.build;
    scripts.build = "bun scripts/build-with-eve.mjs";
    scripts["eve:build"] = "bun scripts/eve-command.mjs build";
    scripts["eve:dev"] = "node scripts/eve-dev.mjs";
    scripts["eve:start"] = "bun scripts/eve-command.mjs start";
    scripts["start:web"] = webStart;
    scripts["start:eve"] = "bun scripts/eve-command.mjs start";
    scripts["start:production"] = "bun scripts/start-production.mjs";
    scripts.start = "bun --env-file=.env.local run start:production";
  }
  if (hasCloudflare) {
    scripts.dev = "bun --env-file=.dev.vars scripts/cloudflare.mjs dev";
    scripts.build = "bun scripts/cloudflare.mjs build";
    scripts.start = "bun run preview";
    scripts["build:worker"] = "bun scripts/cloudflare.mjs build";
    scripts.preview = "bun --env-file=.dev.vars scripts/cloudflare.mjs preview";
    scripts.deploy = "bun scripts/cloudflare.mjs deploy";
    scripts["cloudflare:dry-run"] = "bun scripts/cloudflare.mjs dry-run";
    scripts["cf-typegen"] =
      "bun x --no-install wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts";
    if (isConvex) {
      scripts["convex:bootstrap"] = "bun scripts/cloudflare-convex.mjs bootstrap";
      scripts["convex:dev"] = "bun scripts/cloudflare-convex.mjs dev";
      scripts["convex:deploy"] = "bun scripts/cloudflare-convex.mjs deploy";
      scripts["convex:codegen"] = "bun scripts/cloudflare-convex.mjs codegen";
    }
  }

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    engines: {
      bun: v.runtime.bun,
      ...(runtime === "node" || hasEve ? { node: nodeEngineSelector() } : {}),
    },
    packageManager: `bun@${v.runtime.bun}`,
    scripts,
    dependencies: buildDeps(
      selectedBilling,
      hasEve,
      false,
      true,
      isConvex,
      hasMessaging,
      hasEmail,
      hasApi,
      hasAnalytics,
      hasAuth,
      isNone,
    ),
    devDependencies: {
      "bun-types": `^${v.runtime.bun}`,
      "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
      // Provides `tsr generate` for src/routeTree.gen.ts (see typecheck script).
      "@tanstack/router-cli": `^${v.tanstackStart["@tanstack/router-cli"]}`,
      vite: `^${v.tanstackStart.vite}`,
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
      tailwindcss: `^${v.styling.tailwindcss}`,
      "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
      postcss: `^${v.styling.postcss}`,
      typescript: `^${v.typescript.typescript}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
      "@types/react-is": `^${v.ui["@types/react-is"]}`,
      ...(hasMessaging ? { "@types/ws": `^${v.realtime["@types/ws"]}` } : {}),
      ...(isConvex || isNone ? {} : { "@types/pg": `^${v.database["@types/pg"]}` }),
      ...(isConvex || isNone ? {} : { "drizzle-kit": `^${v.database["drizzle-kit"]}` }),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      "oxc-parser": v.tooling["oxc-parser"],
    },
  });
}

export function singlePackageJsonExpo(
  projectName: string,
  runtime: "node" | "bun",
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  isConvex = false,
  isNone = false,
  hasAnalytics = false,
  hasNotifications = false,
): string {
  const baseDb: Record<string, string> = isConvex
    ? {
        convex: `^${v.convex.convex}`,
        "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
      }
    : isNone
      ? {}
      : {
          "drizzle-orm": `^${v.database["drizzle-orm"]}`,
          pg: `^${v.database.pg}`,
        };

  const deps: Record<string, string> = {
    "@expo/metro-runtime": `~${v.expo["@expo/metro-runtime"]}`,
    "@orpc/client": `^${v.orpc["@orpc/client"]}`,
    "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
    "@orpc/server": `^${v.orpc["@orpc/server"]}`,
    "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
    "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
    "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
    "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
    "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
    "better-auth": `^${v.auth["better-auth"]}`,
    ...baseDb,
    resend: `^${v.email.resend}`,
    zod: `^${v.validation.zod}`,
    "@t3-oss/env-core": `^${v.validation["@t3-oss/env-core"]}`,
    "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
    // src/lib/auth-client.ts imports @better-auth/expo (expo-network is its peer).
    "@better-auth/expo": `^${v.auth["@better-auth/expo"]}`,
    "expo-network": `~${v.expo["expo-network"]}`,
    expo: `~${v.expo.expo}`,
    "expo-constants": `~${v.expo["expo-constants"]}`,
    "expo-linking": `~${v.expo["expo-linking"]}`,
    "expo-router": `~${v.expo["expo-router"]}`,
    "expo-secure-store": `~${v.expo["expo-secure-store"]}`,
    "expo-status-bar": `~${v.expo["expo-status-bar"]}`,
    "expo-web-browser": `~${v.expo["expo-web-browser"]}`,
    "expo-clipboard": `~${v.expo["expo-clipboard"]}`,
    ...(hasNotifications
      ? {
          "expo-device": `~${v.expo["expo-device"]}`,
          "expo-notifications": `~${v.expo["expo-notifications"]}`,
        }
      : {}),
    ...(hasI18n ? { "expo-localization": `~${v.expo["expo-localization"]}` } : {}),
    "@react-native-community/netinfo": v.expo["@react-native-community/netinfo"],
    "@react-native-async-storage/async-storage":
      v.expo["@react-native-async-storage/async-storage"],
    "@tanstack/query-async-storage-persister": `^${v.tanstack["@tanstack/query-async-storage-persister"]}`,
    "@tanstack/query-persist-client-core": `^${v.tanstack["@tanstack/query-persist-client-core"]}`,
    react: v.expoReact.react,
    // app.json declares the web platform; react-native-web peers on react-dom and
    // `expo export` refuses to start without it.
    "react-dom": v.expoReact["react-dom"],
    "react-native": v.expo["react-native"],
    "react-native-safe-area-context": `~${v.expo["react-native-safe-area-context"]}`,
    "react-native-screens": `~${v.expo["react-native-screens"]}`,
    "react-native-gesture-handler": `~${v.expo["react-native-gesture-handler"]}`,
    "react-native-web": `~${v.expo["react-native-web"]}`,
    "react-native-reanimated": v.reanimated["react-native-reanimated"],
    "react-native-worklets": v.worklets["react-native-worklets"],
    clsx: `^${v.ui.clsx}`,
    "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
    // global.css imports tailwindcss and uniwind peers on it (>=4).
    tailwindcss: `^${v.styling.tailwindcss}`,
    "tailwind-variants": `^${v.uniwind["tailwind-variants"]}`,
    "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
    uniwind: `^${v.uniwind.uniwind}`,
    sonner: `^${v.ui.sonner}`,
    ...(hasAnalytics ? { "posthog-react-native": `^${v.analytics["posthog-react-native"]}` } : {}),
  };

  const has = (n: BillingProviderName) => selectedBilling.includes(n);
  if (has("stripe")) deps.stripe = v.billing.stripe;
  if (has("chargily")) deps["@chargily/chargily-pay"] = `^${v.billing["@chargily/chargily-pay"]}`;
  if (has("paddle")) {
    deps["@paddle/paddle-node-sdk"] = `^${v.billing["@paddle/paddle-node-sdk"]}`;
    deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
  }
  if (has("polar")) {
    deps["@polar-sh/sdk"] = `^${v.billing["@polar-sh/sdk"]}`;
  }
  if (hasEve) {
    deps.eve = `^${v.eve.eve}`;
    deps["just-bash"] = v.eve["just-bash"];
    deps.ai = `^${v.eve.ai}`;
    deps["@vercel/connect"] = `^${v.eve["@vercel/connect"]}`;
  }
  const scripts: Record<string, string> = isConvex
    ? {
        dev: "expo start --port 19000",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
        build: "expo export",
        typecheck: "tsc --noEmit",
        test: "bun test",
        lint: "oxlint --deny-warnings .",
        "lint:all": "bun run lint && bun run typecheck",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
      }
    : {
        dev: "expo start --port 19000",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
        build: "expo export",
        typecheck: "tsc --noEmit",
        test: "bun test",
        lint: "oxlint --deny-warnings .",
        "lint:all": "bun run lint && bun run typecheck",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        ...(isNone
          ? {}
          : {
              "db:generate": drizzleScript(runtime, "generate"),
              "db:migrate": drizzleScript(runtime, "migrate"),
              "db:push": drizzleScript(runtime, "push"),
            }),
      };

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    main: "expo-router/entry",
    private: true,
    type: "module",
    engines: {
      bun: v.runtime.bun,
      ...(runtime === "node" ? { node: nodeEngineSelector() } : {}),
    },
    packageManager: `bun@${v.runtime.bun}`,
    scripts,
    dependencies: deps,
    devDependencies: {
      "bun-types": `^${v.runtime.bun}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `~${v.expoReact["@types/react"]}`,
      ...(isConvex || isNone ? {} : { "@types/pg": `^${v.database["@types/pg"]}` }),
      ...(isConvex || isNone ? {} : { "drizzle-kit": `^${v.database["drizzle-kit"]}` }),
      "babel-preset-expo": `~${v.expo["babel-preset-expo"]}`,
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      "oxc-parser": v.tooling["oxc-parser"],
      typescript: `~${v.typescript.typescript}`,
    },
  });
}
