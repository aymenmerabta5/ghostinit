/**
 * oRPC contract-first, single port 3000, webhooks via Next.js routes raw Buffer
 * Deduplicated via fragments/css (OKLCH tokens) + fragments/core (security headers)
 */
import { codeScripts, file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import { hasAddon, isAddonInstallerMap } from "../../lib/addons.js";
import { globalCssContent } from "./fragments/css.js";
import {
  cacheComponentsConfigBlock,
  nextConfigHeadersFunction,
  postcssConfigContent,
  transpilePackagesList,
  posthogRewritesBlock,
} from "./fragments/core.js";
import { webUiFiles } from "./fragments/web-ui/index.js";
import { webLibFiles } from "./fragments/web-lib.js";
import { webhookRuntimeDeps } from "./fragments/webhook-deps.js";
import { customNextServerCommand, nextRuntimeCommand } from "../root/next-server-runtime.js";

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

function nextCustomServerDevCommand(runtime: "node" | "bun"): string {
  return customNextServerCommand(runtime, "dev", "../..");
}

function resolveAddonMap(
  hasEveInput: FeatureInput = false,
  explicit?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): AddonInstallerMap | undefined {
  if (isAddonInstallerMap(explicit)) return explicit;
  if (isAddonInstallerMap(hasEveInput)) return hasEveInput;
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
  const hasEmail = addonMap ? hasAddon(addonMap, "email") : true;
  const hasPdf = addonMap ? hasAddon(addonMap, "pdf") : false;
  const hasCloudflare = addonMap ? hasAddon(addonMap, "cloudflare") : false;
  const hasConvex = addonMap ? hasAddon(addonMap, "convex") : false;
  return [
    webPackage(runtime, hasEve, effectiveHasI18n, addonMap, hasEmail),
    nextConfig(
      hasEve,
      effectiveHasI18n,
      hasPdf,
      hasCloudflare,
      hasConvex,
      Boolean(addonMap && hasAddon(addonMap, "paddle")),
    ),
    postcssConfig(),
    globalCss(runtime),
    ...webUiFiles(),
    ...webLibFiles("apps/web/src", "nextjs"),
  ];
}

function webPackage(
  runtime: "node" | "bun",
  hasEve = false,
  hasI18n = false,
  addonMap?: AddonInstallerMap,
  hasEmail = true,
): TemplateFile {
  const hasAuth = addonMap ? hasAddon(addonMap, "auth") : true;
  const hasWebSocketMessaging = Boolean(
    addonMap && hasAddon(addonMap, "messaging") && !hasAddon(addonMap, "convex"),
  );
  const hasCloudflare = Boolean(addonMap && hasAddon(addonMap, "cloudflare"));
  const hasPdf = Boolean(addonMap && hasAddon(addonMap, "pdf"));
  const directDevelopmentCommand = hasWebSocketMessaging
    ? nextCustomServerDevCommand(runtime)
    : nextRuntimeCommand(runtime, "dev", hasPdf);
  return file(
    "apps/web/package.json",
    packageJson({
      name: "web",
      packageManager: `bun@${v.runtime.bun}`,
      ...(hasEve ? { engines: { node: v.runtime.node } } : {}),
      scripts: {
        // The stock Next dev server cannot accept the generated oRPC websocket
        // upgrade. Keep the ordinary `bun run dev` path on the same custom
        // server used in production whenever Postgres messaging is selected.
        dev: hasCloudflare
          ? "bun --env-file=.dev.vars scripts/cloudflare.mjs dev"
          : hasEve
            ? "bun scripts/start-development.mjs"
            : directDevelopmentCommand,
        ...(hasEve
          ? {
              "dev:web": directDevelopmentCommand,
              "eve:dev": "node ../../scripts/eve-dev.mjs",
            }
          : {}),
        // A Worker build must always pass through the generated environment
        // isolation, dry-run packaging, and secret scanner. OpenNext receives
        // its raw Next command from open-next.config.ts to avoid recursion.
        build: hasCloudflare
          ? "bun scripts/cloudflare.mjs build"
          : hasWebSocketMessaging
            ? `bun run build:server && ${nextRuntimeCommand(runtime, "build", hasPdf)}`
            : nextRuntimeCommand(runtime, "build", hasPdf),
        ...(hasWebSocketMessaging
          ? { "build:server": customNextServerCommand(runtime, "build", "../..") }
          : {}),
        start: hasCloudflare ? "bun run preview" : nextRuntimeCommand(runtime, "start", hasPdf),
        ...(hasCloudflare
          ? {
              // OpenNext invokes this only from inside cloudflare.mjs after the
              // wrapper has isolated the build environment.
              "build:framework": nextRuntimeCommand(runtime, "build"),
              "build:worker": "bun scripts/cloudflare.mjs build",
              preview: "bun --env-file=.dev.vars scripts/cloudflare.mjs preview",
              deploy: "bun scripts/cloudflare.mjs deploy",
              upload: "bun scripts/cloudflare.mjs upload",
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
        ...(hasAuth ? { "@repo/auth": "workspace:*" } : {}),
        "@repo/billing": "workspace:*",
        "@repo/config": "workspace:*",
        "@repo/contracts": "workspace:*",
        "@repo/database": "workspace:*",
        ...(hasEmail ? { "@repo/email": "workspace:*" } : {}),
        "@repo/kernel": "workspace:*",
        "@repo/modules": "workspace:*",
        "@repo/observability": "workspace:*",
        ...(addonMap && hasAddon(addonMap, "pdf") ? { "@repo/pdf": "workspace:*" } : {}),
        "@repo/services": "workspace:*",
        "@repo/ui": "workspace:*",
        "@repo/workflows": "workspace:*",
        "@tanstack/react-form": `^${v.tanstack["@tanstack/react-form"]}`,
        "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
        ...(hasAuth ? { "better-auth": `^${v.auth["better-auth"]}` } : {}),
        "class-variance-authority": `^${v.ui["class-variance-authority"]}`,
        clsx: `^${v.ui.clsx}`,
        sonner: `^${v.ui.sonner}`,
        recharts: `^${v.ui.recharts}`,
        "react-is": `^${v.ui["react-is"]}`,
        "tailwind-merge": `^${v.ui["tailwind-merge"]}`,
        "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
        "next-themes": `^${v.ui["next-themes"]}`,
        "lucide-react": `^${v.ui["lucide-react"]}`,
        "server-only": `^${v.runtime["server-only"]}`,
        ...(addonMap && hasAddon(addonMap, "pdf")
          ? {
              "@react-pdf/renderer": `^${v.pdf["@react-pdf/renderer"]}`,
              "dejavu-fonts-ttf": `^${v.pdf["dejavu-fonts-ttf"]}`,
              pdfkit: `^${v.pdf.pdfkit}`,
            }
          : {}),
        ...(hasEve ? { eve: `^${v.eve.eve}` } : {}),
        ...(hasI18n ? { "next-intl": `^${v.i18n["next-intl"]}` } : {}),
        ...(addonMap && hasAddon(addonMap, "convex")
          ? {
              convex: `^${v.convex.convex}`,
              ...(hasAuth
                ? { "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}` }
                : {}),
            }
          : {}),
        // Messaging (postgres) needs WS runtime for apps/web/server.ts (Bun.serve + ws) + crossws for tanstack compat
        ...(addonMap && hasAddon(addonMap, "messaging") && !hasAddon(addonMap, "convex")
          ? {
              "@repo/realtime": "workspace:*",
              "@repo/storage": "workspace:*",
              "drizzle-orm": `^${v.database["drizzle-orm"]}`,
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
        "@types/react-is": `^${v.ui["@types/react-is"]}`,
        ...(addonMap && hasAddon(addonMap, "messaging")
          ? { "@types/ws": `^${v.realtime["@types/ws"]}` }
          : {}),
        "@tailwindcss/postcss": `^${v.styling["@tailwindcss/postcss"]}`,
        postcss: `^${v.styling.postcss}`,
        tailwindcss: `^${v.styling.tailwindcss}`,
        // Next 16.3 uses the project-local native tsc CLI by default.
        typescript: `^${v.typescript.typescript}`,
        ...(hasCloudflare
          ? {
              "@opennextjs/cloudflare": `^${v.cloudflare["@opennextjs/cloudflare"]}`,
              dotenv: `^${v.cloudflare.dotenv}`,
              wrangler: `^${v.cloudflare.wrangler}`,
            }
          : {}),
      },
    }),
  );
}

function nextConfig(
  hasEve = false,
  hasI18n = false,
  hasPdf = false,
  hasCloudflare = false,
  hasConvex = false,
  hasPaddle = false,
): TemplateFile {
  const baseHeaders = nextConfigHeadersFunction(hasConvex, hasPaddle);
  const transpile = transpilePackagesList;
  const rewritesBlock = posthogRewritesBlock();
  const imagesBlock = `  images: {
    remotePatterns: [],
  },`;
  const pdfTracingBlock = hasPdf
    ? `  outputFileTracingIncludes: {
    "/api/pdf": [
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf",
    ],
  },`
    : "";
  if (hasEve && hasI18n) {
    return file(
      "apps/web/next.config.ts",
      `${hasCloudflare ? 'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";\n' : ""}import type { NextConfig } from "next";
import { withEve, type EveNextConfigFunction } from "eve/next";
import createNextIntlPlugin from "next-intl/plugin";

${hasCloudflare ? 'if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();\n\n' : ""}
const config: NextConfig = {
${cacheComponentsConfigBlock(hasCloudflare)}
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${pdfTracingBlock}
${rewritesBlock}
${transpile}
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withEveConfig = withEve(withNextIntl(config), {
  eveRoot: "../eve",
});

// Eve returns a Next config function, so resolve it before normalizing fields.
const nextConfig: EveNextConfigFunction<NextConfig> = async (phase, context) => {
  const resolved = await withEveConfig(phase, context);
  const experimental = resolved.experimental;
  if (!experimental || !Reflect.has(experimental, "turbo")) return resolved;
  const normalizedExperimental = { ...experimental };
  Reflect.deleteProperty(normalizedExperimental, "turbo");
  return { ...resolved, experimental: normalizedExperimental };
};

export default nextConfig;
`,
    );
  }
  if (hasEve) {
    return file(
      "apps/web/next.config.ts",
      `${hasCloudflare ? 'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";\n' : ""}import type { NextConfig } from "next";
import { withEve, type EveNextConfigFunction } from "eve/next";

${hasCloudflare ? 'if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();\n\n' : ""}
const config: NextConfig = {
${cacheComponentsConfigBlock(hasCloudflare)}
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${pdfTracingBlock}
${rewritesBlock}
${transpile}
};

const withEveConfig = withEve(config, {
  eveRoot: "../eve",
});

// Eve returns a Next config function, so resolve it before normalizing fields.
const nextConfig: EveNextConfigFunction<NextConfig> = async (phase, context) => {
  const resolved = await withEveConfig(phase, context);
  const experimental = resolved.experimental;
  if (!experimental || !Reflect.has(experimental, "turbo")) return resolved;
  const normalizedExperimental = { ...experimental };
  Reflect.deleteProperty(normalizedExperimental, "turbo");
  return { ...resolved, experimental: normalizedExperimental };
};

export default nextConfig;
`,
    );
  }
  if (hasI18n) {
    return file(
      "apps/web/next.config.ts",
      `${hasCloudflare ? 'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";\n' : ""}import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

${hasCloudflare ? 'if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();\n\n' : ""}
const config: NextConfig = {
${cacheComponentsConfigBlock(hasCloudflare)}
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${pdfTracingBlock}
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
    `${hasCloudflare ? 'import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";\n' : ""}import type { NextConfig } from "next";

${hasCloudflare ? 'if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();\n\n' : ""}
const config: NextConfig = {
${cacheComponentsConfigBlock(hasCloudflare)}
  reactStrictMode: true,
  poweredByHeader: false,
${baseHeaders}
${imagesBlock}
${pdfTracingBlock}
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
