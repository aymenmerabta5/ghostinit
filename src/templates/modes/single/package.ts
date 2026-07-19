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
