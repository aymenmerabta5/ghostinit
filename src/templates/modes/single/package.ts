import { packageJson } from "../../shared.js";
import * as v from "../../versions.js";
import type { BillingProviderName } from "../../../lib/addons.js";

function buildDeps(
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
  isTanstack = false,
): Record<string, string> {
  const deps: Record<string, string> = isTanstack
    ? {
        "@tanstack/react-start": `^${v.tanstackStart["@tanstack/react-start"]}`,
        "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        "better-auth": `^${v.auth["better-auth"]}`,
        "drizzle-orm": `^${v.database["drizzle-orm"]}`,
        zod: `^${v.validation.zod}`,
        "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
        resend: `^${v.email.resend}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
        pg: `^${v.database.pg}`,
        sonner: `^${v.ui.sonner}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
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
        "drizzle-orm": `^${v.database["drizzle-orm"]}`,
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
        pg: `^${v.database.pg}`,
        sonner: `^${v.ui.sonner}`,
        clsx: `^${v.ui.clsx}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
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
  return deps;
}

export function singlePackageJson(
  projectName: string,
  runtime: "node" | "bun",
  selectedBilling: BillingProviderName[],
  hasEve: boolean,
  hasI18n: boolean,
): string {
  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      typecheck: "tsc --noEmit",
      test: runtime === "bun" ? "bun test" : "npm run test:unit",
      lint: "oxlint .",
      format: "oxfmt --write .",
      "format:check": "oxfmt --check .",
      "db:generate": "drizzle-kit generate",
      "db:migrate": "drizzle-kit migrate",
      "db:push": "drizzle-kit push",
    },
    dependencies: buildDeps(selectedBilling, hasEve, hasI18n, false),
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      typescript: `^${v.typescript.typescript}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
      "@types/pg": `^${v.database["@types/pg"]}`,
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
): string {
  void hasI18n;
  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    scripts: {
      dev: "vite dev --port 3000",
      build: "vite build",
      start: "node .output/server/index.mjs",
      typecheck: "tsc --noEmit",
      test: runtime === "bun" ? "bun test" : "npm run test:unit",
      lint: "oxlint .",
      format: "oxfmt --write .",
      "format:check": "oxfmt --check .",
      "db:generate": "drizzle-kit generate",
      "db:migrate": "drizzle-kit migrate",
      "db:push": "drizzle-kit push",
    },
    dependencies: buildDeps(selectedBilling, hasEve, false, true),
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
      vite: `^${v.tanstackStart.vite}`,
      "@vitejs/plugin-react": `^${v.tanstackStart["@vitejs/plugin-react"]}`,
      "@tailwindcss/vite": `^${v.tanstackStart["@tailwindcss/vite"]}`,
      nitro: `^${v.tanstackStart.nitro}`,
      nitropack: `^${v.tanstackStart.nitro}`,
      tailwindcss: `^${v.styling.tailwindcss}`,
      "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
      postcss: `^${v.styling.postcss}`,
      typescript: `^${v.typescript.typescript}`,
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/react-dom": `^${v.nextStack["@types/react-dom"]}`,
      "@types/pg": `^${v.database["@types/pg"]}`,
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
): string {
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
    "drizzle-orm": `^${v.database["drizzle-orm"]}`,
    pg: `^${v.database.pg}`,
    resend: `^${v.email.resend}`,
    zod: `^${v.validation.zod}`,
    "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
    expo: `^${v.expo.expo}`,
    "expo-constants": `^${v.expo["expo-constants"]}`,
    "expo-linking": `^${v.expo["expo-linking"]}`,
    "expo-router": `^${v.expo["expo-router"]}`,
    "expo-secure-store": `^${v.expo["expo-secure-store"]}`,
    "expo-status-bar": `^${v.expo["expo-status-bar"]}`,
    "expo-web-browser": `^${v.expo["expo-web-browser"]}`,
    "expo-clipboard": `^${v.expo["expo-clipboard"]}`,
    react: `^${v.nextStack.react}`,
    "react-native": `^${(v.expo["react-native"] as string) ?? "0.81.4"}`,
    "react-native-safe-area-context": `^${v.expo["react-native-safe-area-context"]}`,
    "react-native-web": `^${v.expo["react-native-web"]}`,
    "react-native-reanimated": `^${v.reanimated["react-native-reanimated"]}`,
    "react-native-worklets": `^${v.worklets["react-native-worklets"]}`,
    clsx: `^${v.ui.clsx}`,
    "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
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

  return packageJson({
    name: projectName,
    version: v.ghostinitVersion,
    main: "expo-router/entry",
    private: true,
    type: "module",
    packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
    scripts: {
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
    },
    dependencies: deps,
    devDependencies: {
      ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
      "@types/node": `^${v.runtime["@types/node"]}`,
      "@types/react": `^${v.nextStack["@types/react"]}`,
      "@types/pg": `^${v.database["@types/pg"]}`,
      "babel-preset-expo": `^${v.expo["babel-preset-expo"]}`,
      oxlint: `^${v.tooling.oxlint}`,
      oxfmt: `^${v.tooling.oxfmt}`,
      typescript: `^${v.typescript.typescript}`,
    },
  });
}
