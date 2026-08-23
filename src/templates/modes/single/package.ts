// @allow-long 352: single-mode package.json dependency matrix across every addon combination — effectively a data table
import { packageJson } from "../../shared.js";
import * as v from "../../versions.js";
import type { BillingProviderName } from "../../../lib/addons.js";

function buildDeps(
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  isTanstack = false,
  isConvex = false,
  hasMessaging = false,
): Record<string, string> {
  const baseConvex: Record<string, string> = isConvex
    ? {
        convex: `^${v.convex.convex}`,
        "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
      }
    : {
        "drizzle-orm": `^${v.database["drizzle-orm"]}`,
        pg: `^${v.database.pg}`,
      };

  const deps: Record<string, string> = isTanstack
    ? {
        "@tanstack/react-start": `^${v.tanstackStart["@tanstack/react-start"]}`,
        "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        "better-auth": `^${v.auth["better-auth"]}`,
        ...baseConvex,
        zod: `^${v.validation.zod}`,
        "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
        resend: `^${v.email.resend}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
        sonner: `^${v.ui.sonner}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        // Required by the shadcn-style components emitted via singleWebUiFiles().
        "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        "posthog-js": `^${v.analytics["posthog-js"]}`,
        "posthog-node": `^${v.analytics["posthog-node"]}`,
      }
    : {
        next: `^${v.nextStack.next}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        "better-auth": `^${v.auth["better-auth"]}`,
        ...baseConvex,
        zod: `^${v.validation.zod}`,
        "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
        resend: `^${v.email.resend}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
        sonner: `^${v.ui.sonner}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        // Required by the shadcn-style components emitted via singleWebUiFiles().
        "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        "posthog-js": `^${v.analytics["posthog-js"]}`,
        "posthog-node": `^${v.analytics["posthog-node"]}`,
      };

  const has = (n: BillingProviderName) => selectedBilling.includes(n);
  if (has("stripe")) deps.stripe = `^${v.billing.stripe}`;
  if (has("chargily")) deps["@chargily/chargily-pay"] = `^${v.billing["@chargily/chargily-pay"]}`;
  if (has("paddle")) {
    deps["@paddle/paddle-node-sdk"] = `^${v.billing["@paddle/paddle-node-sdk"]}`;
    deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
  }
  if (has("polar")) {
    deps["@polar-sh/sdk"] = `^${v.billing["@polar-sh/sdk"]}`;
    deps["@polar-sh/nextjs"] = `^${v.billing["@polar-sh/nextjs"]}`;
  }
  if (hasEve) {
    deps.eve = `^${v.eve.eve}`;
    deps.ai = `^${v.eve.ai}`;
    deps["@vercel/connect"] = `^${v.eve["@vercel/connect"]}`;
  }
  if (hasI18n && !isTanstack) {
    deps["next-intl"] = `^${v.i18n["next-intl"]}`;
  }
  if (hasMessaging && !isConvex) {
    deps.ws = `^${v.realtime.ws}`;
    deps.crossws = `^${v.realtime.crossws}`;
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
): string {
  const lintAll =
    "oxlint . && node scripts/check-import-aliases.cjs && node scripts/check-next-parity.cjs && node scripts/check-navigation-imports.cjs";
  const scripts: Record<string, string> = isConvex
    ? {
        dev: "next dev",
        build: "next build",
        start: "next start",
        typecheck: "tsc --noEmit",
        test: runtime === "bun" ? "bun test" : "npm run test:unit",
        lint: lintAll,
        "lint:oxlint": "oxlint .",
        "lint:imports": "node scripts/check-import-aliases.cjs",
        "lint:next-parity": "node scripts/check-next-parity.cjs",
        "lint:navigation": "node scripts/check-navigation-imports.cjs",
        "lint:architecture": "node scripts/check-feature-folder.cjs",
        "lint:rtl": "node scripts/check-rtl-logical.cjs",
        "lint:animations": "node scripts/check-animation-imports.cjs",
        "lint:server-only": "node scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
      }
    : {
        dev: "next dev",
        build: "next build",
        start: "next start",
        typecheck: "tsc --noEmit",
        test: runtime === "bun" ? "bun test" : "npm run test:unit",
        lint: lintAll,
        "lint:oxlint": "oxlint .",
        "lint:imports": "node scripts/check-import-aliases.cjs",
        "lint:next-parity": "node scripts/check-next-parity.cjs",
        "lint:navigation": "node scripts/check-navigation-imports.cjs",
        "lint:architecture": "node scripts/check-feature-folder.cjs",
        "lint:rtl": "node scripts/check-rtl-logical.cjs",
        "lint:animations": "node scripts/check-animation-imports.cjs",
        "lint:server-only": "node scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:push": "drizzle-kit push",
      };

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    scripts,
    dependencies: buildDeps(selectedBilling, hasEve, hasI18n, false, isConvex, hasMessaging),
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      typescript: `^${v.typescript.typescript}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
      ...(isConvex ? {} : { "@types/pg": `^${v.database["@types/pg"]}` }),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      tailwindcss: `^${v.styling.tailwindcss}`,
      "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
      postcss: `^${v.styling.postcss}`,
    },
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
): string {
  void hasI18n;
  const lintAll =
    "oxlint . && node scripts/check-import-aliases.cjs && node scripts/check-navigation-imports.cjs";
  const scripts: Record<string, string> = isConvex
    ? {
        dev: "vite dev --port 3000",
        build: "vite build",
        start: "node .output/server/index.mjs",
        typecheck: "tsr generate && tsc --noEmit",
        test: runtime === "bun" ? "bun test" : "npm run test:unit",
        lint: lintAll,
        "lint:oxlint": "oxlint .",
        "lint:imports": "node scripts/check-import-aliases.cjs",
        "lint:architecture": "node scripts/check-feature-folder.cjs",
        "lint:rtl": "node scripts/check-rtl-logical.cjs",
        "lint:animations": "node scripts/check-animation-imports.cjs",
        "lint:server-only": "node scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "convex:dev": "convex dev",
        "convex:deploy": "convex deploy",
        "convex:codegen": "convex codegen",
      }
    : {
        dev: "vite dev --port 3000",
        build: "vite build",
        start: "node .output/server/index.mjs",
        typecheck: "tsr generate && tsc --noEmit",
        test: runtime === "bun" ? "bun test" : "npm run test:unit",
        lint: lintAll,
        "lint:oxlint": "oxlint .",
        "lint:imports": "node scripts/check-import-aliases.cjs",
        "lint:architecture": "node scripts/check-feature-folder.cjs",
        "lint:rtl": "node scripts/check-rtl-logical.cjs",
        "lint:animations": "node scripts/check-animation-imports.cjs",
        "lint:server-only": "node scripts/check-server-only.cjs",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:push": "drizzle-kit push",
      };

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    scripts,
    dependencies: buildDeps(selectedBilling, hasEve, false, true, isConvex, hasMessaging),
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
      // Provides `tsr generate` for src/routeTree.gen.ts (see typecheck script).
      "@tanstack/router-cli": `^${v.tanstackStart["@tanstack/router-cli"]}`,
      vite: `^${v.tanstackStart.vite}`,
      "@vitejs/plugin-react": `^${v.tanstackStart["@vitejs/plugin-react"]}`,
      "@tailwindcss/vite": `^${v.tanstackStart["@tailwindcss/vite"]}`,
      nitro: `^${v.tanstackStart.nitro}`,
      tailwindcss: `^${v.styling.tailwindcss}`,
      "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
      postcss: `^${v.styling.postcss}`,
      typescript: `^${v.typescript.typescript}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
      ...(isConvex ? {} : { "@types/pg": `^${v.database["@types/pg"]}` }),
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
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
): string {
  const baseDb: Record<string, string> = isConvex
    ? {
        convex: `^${v.convex.convex}`,
        "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
      }
    : {
        "drizzle-orm": `^${v.database["drizzle-orm"]}`,
        pg: `^${v.database.pg}`,
      };

  const deps: Record<string, string> = {
    "@expo/metro-runtime": `^${v.expo["@expo/metro-runtime"]}`,
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
    "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
    // src/lib/auth-client.ts imports @better-auth/expo (expo-network is its peer).
    "@better-auth/expo": `^${v.auth["@better-auth/expo"]}`,
    "expo-network": `^${v.expo["expo-network"]}`,
    expo: `^${v.expo.expo}`,
    "expo-constants": `^${v.expo["expo-constants"]}`,
    "expo-linking": `^${v.expo["expo-linking"]}`,
    "expo-router": `^${v.expo["expo-router"]}`,
    "expo-secure-store": `^${v.expo["expo-secure-store"]}`,
    "expo-status-bar": `^${v.expo["expo-status-bar"]}`,
    "expo-web-browser": `^${v.expo["expo-web-browser"]}`,
    "expo-clipboard": `^${v.expo["expo-clipboard"]}`,
    react: `^${v.nextStack.react}`,
    // app.json declares the web platform; react-native-web peers on react-dom and
    // `expo export` refuses to start without it.
    "react-dom": `^${v.nextStack["react-dom"]}`,
    "react-native": `^${(v.expo["react-native"] as string) ?? "0.81.4"}`,
    "react-native-safe-area-context": `^${v.expo["react-native-safe-area-context"]}`,
    "react-native-web": `^${v.expo["react-native-web"]}`,
    "react-native-reanimated": `^${v.reanimated["react-native-reanimated"]}`,
    "react-native-worklets": `^${v.worklets["react-native-worklets"]}`,
    clsx: `^${v.ui.clsx}`,
    "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
    // global.css imports tailwindcss and uniwind peers on it (>=4).
    tailwindcss: `^${v.styling.tailwindcss}`,
    "tailwind-variants": `^${v.uniwind["tailwind-variants"]}`,
    "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
    uniwind: `^${v.uniwind.uniwind}`,
    sonner: `^${v.ui.sonner}`,
    "posthog-js": `^${v.analytics["posthog-js"]}`,
    "posthog-node": `^${v.analytics["posthog-node"]}`,
  };

  const has = (n: BillingProviderName) => selectedBilling.includes(n);
  if (has("stripe")) deps.stripe = `^${v.billing.stripe}`;
  if (has("chargily")) deps["@chargily/chargily-pay"] = `^${v.billing["@chargily/chargily-pay"]}`;
  if (has("paddle")) {
    deps["@paddle/paddle-node-sdk"] = `^${v.billing["@paddle/paddle-node-sdk"]}`;
    deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
  }
  if (has("polar")) {
    deps["@polar-sh/sdk"] = `^${v.billing["@polar-sh/sdk"]}`;
    deps["@polar-sh/nextjs"] = `^${v.billing["@polar-sh/nextjs"]}`;
  }
  if (hasEve) {
    deps.eve = `^${v.eve.eve}`;
    deps.ai = `^${v.eve.ai}`;
    deps["@vercel/connect"] = `^${v.eve["@vercel/connect"]}`;
  }
  if (hasI18n) {
    deps["next-intl"] = `^${v.i18n["next-intl"]}`;
  }

  const scripts: Record<string, string> = isConvex
    ? {
        dev: "expo start --port 19000",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
        build: "expo export",
        typecheck: "tsc --noEmit",
        test: runtime === "bun" ? "bun test" : "npm run test:unit",
        lint: "oxlint .",
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
        test: runtime === "bun" ? "bun test" : "npm run test:unit",
        lint: "oxlint .",
        format: "oxfmt --write .",
        "format:check": "oxfmt --check .",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:push": "drizzle-kit push",
      };

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    main: "expo-router/entry",
    private: true,
    type: "module",
    packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
    scripts,
    dependencies: deps,
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      ...(isConvex ? {} : { "@types/pg": `^${v.database["@types/pg"]}` }),
      "babel-preset-expo": `^${v.expo["babel-preset-expo"]}`,
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      typescript: `^${v.typescript.typescript}`,
    },
  });
}
