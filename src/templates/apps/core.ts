/**
 * oRPC contract-first, single port 3000, webhooks via Next.js routes raw Buffer
 * Deduplicated via fragments/css (OKLCH tokens) + fragments/core (security headers)
 */
import { codeScripts, file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";
import { globalCssContent } from "./fragments/css.js";
import {
  nextConfigHeadersFunction,
  postcssConfigContent,
  transpilePackagesList,
  posthogRewritesBlock,
} from "./fragments/core.js";
import { webUiFiles } from "./fragments/web-ui/index.js";
import { webhookRuntimeDeps } from "./fragments/webhook-deps.js";

type FeatureInput =
  | boolean
  | AddonInstallerMap
  | Record<string, { inUse: boolean }>
  | BillingProviderName[];
type InUseRecord = Record<string, { inUse?: boolean }>;

function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  if (Array.isArray(input)) return false;
  const record = input as InUseRecord;
  return Boolean(record[feature]?.inUse);
}

function resolveHasEve(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "eve");
}

function resolveHasI18n(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "i18n");
}

function resolveAddonMap(
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

export function coreFiles(
  runtime: "node" | "bun" = "bun",
  hasEveInput: FeatureInput = false,
  hasI18nInput: FeatureInput = false,
  addonMapExplicit?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): TemplateFile[] {
  const hasEve = resolveHasEve(hasEveInput);
  const hasI18n = resolveHasI18n(hasI18nInput ?? hasEveInput);
  const effectiveHasI18n = typeof hasEveInput !== "boolean" ? resolveHasI18n(hasEveInput) : hasI18n;
  const addonMap = resolveAddonMap(hasEveInput, addonMapExplicit);
  return [
    webPackage(runtime, hasEve, effectiveHasI18n, addonMap),
    nextConfig(hasEve, effectiveHasI18n),
    postcssConfig(),
    globalCss(runtime),
    ...webUiFiles(),
  ];
}

function webPackage(
  runtime: "node" | "bun",
  hasEve = false,
  hasI18n = false,
  addonMap?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): TemplateFile {
  return file(
    "apps/web/package.json",
    packageJson({
      name: "web",
      packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        ...codeScripts({
          test: runtime === "bun" ? "bun test tests" : "npm run test:unit",
          e2e: true,
        }),
      },
      dependencies: {
        "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
        "@orpc/server": `^${v.orpc["@orpc/server"]}`,
        "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
        "@repo/analytics": "workspace:*",
        "@repo/api": "workspace:*",
        "@repo/auth": "workspace:*",
        "@repo/billing": "workspace:*",
        "@repo/config": "workspace:*",
        "@repo/contracts": "workspace:*",
        "@repo/database": "workspace:*",
        "@repo/email": "workspace:*",
        "@repo/kernel": "workspace:*",
        "@repo/modules": "workspace:*",
        "@repo/observability": "workspace:*",
        "@repo/services": "workspace:*",
        "@repo/ui": "workspace:*",
        "@repo/workflows": "workspace:*",
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        clsx: `^${v.ui.clsx}`,
        sonner: `^${v.ui.sonner}`,
        recharts: `^${v.ui.recharts}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        ...(hasEve ? { eve: `^${v.eve.eve}` } : {}),
        ...(hasI18n ? { "next-intl": `^${v.i18n["next-intl"]}` } : {}),
        ...(addonMap && hasAddon(addonMap as AddonInstallerMap, "convex")
          ? {
              convex: `^${v.convex.convex}`,
              "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
            }
          : {}),
        // Messaging (postgres) needs WS runtime for apps/web/server.ts (Bun.serve + ws) + crossws for tanstack compat
        ...(addonMap &&
        hasAddon(addonMap as AddonInstallerMap, "messaging") &&
        !hasAddon(addonMap as AddonInstallerMap, "convex")
          ? {
              ws: `^${v.realtime.ws}`,
              crossws: `^${v.realtime.crossws}`,
            }
          : {}),
        // apps/web hosts the webhook routes, so it imports the provider SDKs and
        // (on drizzle) `eq` from drizzle-orm directly. These must be declared here,
        // not merely hoisted from @repo/billing.
        ...webhookRuntimeDeps(addonMap),
        next: `^${v.nextStack.next}`,
        react: `^${v.nextStack.react}`,
        "react-dom": `^${v.nextStack["react-dom"]}`,
        zod: `^${v.validation.zod}`,
      },
      devDependencies: {
        // apps/web tsconfig lists types: ["bun-types", ...] — declare it or TS2688.
        "bun-types": `^${v.runtime.bun}`,
        "@playwright/test": `^${v.testing.playwright}`,
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

function nextConfig(hasEve = false, hasI18n = false): TemplateFile {
  const baseHeaders = nextConfigHeadersFunction();
  const transpile = transpilePackagesList;
  const rewritesBlock = posthogRewritesBlock();
  const imagesBlock = `  images: {
    remotePatterns: [],
  },`;

  if (hasEve && hasI18n) {
    return file(
      "apps/web/next.config.ts",
      `import type { NextConfig } from "next";
import { withEve } from "eve/next";
import createNextIntlPlugin from "next-intl/plugin";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${rewritesBlock}
${transpile}
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = withEve(withNextIntl(config), {
  eveRoot: "../eve",
});

// withEve may add experimental.turbo, which is invalid in Next 16.
// Bind the narrowed object first: TS cannot prove the property is defined on
// the second (separately-asserted) expression, so deleting through it was TS2532.
const eveExperimental = (nextConfig as unknown as { experimental?: { turbo?: unknown } })
  .experimental;
if (eveExperimental?.turbo) {
  delete eveExperimental.turbo;
}

export default nextConfig;
`,
    );
  }
  if (hasEve) {
    return file(
      "apps/web/next.config.ts",
      `import type { NextConfig } from "next";
import { withEve } from "eve/next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${rewritesBlock}
${transpile}
};

const nextConfig = withEve(config, {
  eveRoot: "../eve",
});

// withEve may add experimental.turbo, which is invalid in Next 16.
// Bind the narrowed object first: TS cannot prove the property is defined on
// the second (separately-asserted) expression, so deleting through it was TS2532.
const eveExperimental = (nextConfig as unknown as { experimental?: { turbo?: unknown } })
  .experimental;
if (eveExperimental?.turbo) {
  delete eveExperimental.turbo;
}

export default nextConfig;
`,
    );
  }
  if (hasI18n) {
    return file(
      "apps/web/next.config.ts",
      `import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${rewritesBlock}
${transpile}
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(config);
`,
    );
  }
  return file(
    "apps/web/next.config.ts",
    `import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${rewritesBlock}
${transpile}
};

export default config;
`,
  );
}

function postcssConfig(): TemplateFile {
  return file("apps/web/postcss.config.mjs", postcssConfigContent());
}

function globalCss(_runtime: "node" | "bun"): TemplateFile {
  return file("apps/web/src/app/globals.css", globalCssContent());
}
