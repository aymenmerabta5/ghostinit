// @allow-long 386: assembles app files plus the tsconfig path-alias matrix for every framework; the alias tables are data, and separating them from their consumer invites drift
import type { TemplateFile } from "../../shared.js";
import { file, packageJson } from "../../shared.js";
import {
  appsFiles as genAppsFiles,
  tanstackStartFiles as genTanstackFiles,
  expoFiles as genExpoFiles,
} from "../../apps/index.js";
import { desktopCoreFiles } from "../../apps/desktop-core.js";
import type { AddonInstallerMap, FrameworkName } from "../../../lib/addons.js";
import { hasAddon } from "../../../lib/addons.js";

function appsFilesWithConditionalEve(
  runtime: "node" | "bun",
  addons: AddonInstallerMap,
  framework: FrameworkName = "nextjs",
): TemplateFile[] {
  const hasEve = hasAddon(addons, "eve");
  const isTanstack = framework === "tanstack-start" || hasAddon(addons, "tanstack-start");
  const base = isTanstack ? genTanstackFiles(runtime, addons) : genAppsFiles(runtime, addons);
  if (hasEve || isTanstack) return base;
  const nonEveConfig = file(
    "apps/web/next.config.ts",
    [
      "import type { NextConfig } from 'next';",
      "",
      "const config: NextConfig = {",
      "  reactStrictMode: true,",
      "  poweredByHeader: false,",
      "  async headers() {",
      "    return [{ source: '/:path*', headers: [",
      "      { key: 'X-Content-Type-Options', value: 'nosniff' },",
      "      { key: 'X-Frame-Options', value: 'DENY' },",
      "      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },",
      "      { key: 'X-XSS-Protection', value: '0' },",
      "      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },",
      "      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },",
      "      { key: 'Content-Security-Policy', value: \"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';\", },",
      "    ] }]; },",
      "  async rewrites() { return [",
      '    { source: "/ingest/static/:path*", destination: "https://us.i.posthog.com/static/:path*" },',
      '    { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },',
      '    { source: "/ingest/decide", destination: "https://us.i.posthog.com/decide" },',
      "  ]; },",
      "  transpilePackages: ['@repo/analytics','@repo/api','@repo/auth','@repo/billing','@repo/config','@repo/contracts','@repo/database','@repo/email','@repo/kernel','@repo/modules','@repo/observability','@repo/services','@repo/ui'],",
      "};",
      "export default config;",
      "",
    ].join("\n"),
  );
  return [...base.filter((f: TemplateFile) => f.path !== "apps/web/next.config.ts"), nonEveConfig];
}

function typescriptConfigWithAliases(
  framework: FrameworkName = "nextjs",
  apps?: string[],
): TemplateFile[] {
  const isTanstack = framework === "tanstack-start";
  const explicitBasePaths: Record<string, string[]> = {
    "@/*": ["./src/*"],
    "@repo/*": ["packages/*/src", "tooling/*/src"],
    "@repo/api": ["packages/api/src/index.ts"],
    "@repo/api/*": ["packages/api/src/*"],
    "@repo/analytics": ["packages/analytics/src/index.ts"],
    "@repo/analytics/*": ["packages/analytics/src/*"],
    "@repo/auth": ["packages/auth/src/index.ts"],
    "@repo/auth/*": ["packages/auth/src/*"],
    "@repo/billing": ["packages/billing/src/index.ts"],
    "@repo/billing/*": ["packages/billing/src/*"],
    "@repo/config": ["packages/config/src/index.ts"],
    "@repo/config/*": ["packages/config/src/*"],
    "@repo/contracts": ["packages/contracts/src/index.ts"],
    "@repo/contracts/*": ["packages/contracts/src/*"],
    "@repo/database": ["packages/database/src/index.ts"],
    "@repo/database/*": ["packages/database/src/*"],
    "@repo/email": ["packages/email/src/index.ts"],
    "@repo/email/*": ["packages/email/src/*"],
    "@repo/kernel": ["packages/kernel/src/index.ts"],
    "@repo/modules": ["packages/modules/src/index.ts"],
    "@repo/modules/*": ["packages/modules/src/*"],
    "@repo/observability": ["packages/observability/src/index.ts"],
    "@repo/observability/*": ["packages/observability/src/*"],
    "@repo/realtime": ["packages/realtime/src/index.ts"],
    "@repo/realtime/*": ["packages/realtime/src/*"],
    "@repo/services": ["packages/services/src/index.ts"],
    "@repo/services/*": ["packages/services/src/*"],
    "@repo/storage": ["packages/storage/src/index.ts"],
    "@repo/storage/*": ["packages/storage/src/*"],
    "@repo/ui": ["packages/ui/src/index.ts"],
    "@repo/ui/*": ["packages/ui/src/*"],
    "@repo/testing": ["packages/testing/src/index.ts"],
    "@repo/testing/*": ["packages/testing/src/*"],
    "@repo/workflows": ["packages/workflows/src/index.ts"],
    "@repo/workflows/*": ["packages/workflows/src/*"],
  };

  const explicitNextPaths: Record<string, string[]> = {
    "@/*": ["./src/*"],
    "@repo/*": ["packages/*/src", "tooling/*/src"],
    "@repo/api": ["packages/api/src/index.ts"],
    "@repo/analytics": ["packages/analytics/src/index.ts"],
    "@repo/auth": ["packages/auth/src/index.ts"],
    "@repo/auth/*": ["packages/auth/src/*"],
    "@repo/billing": ["packages/billing/src/index.ts"],
    "@repo/billing/*": ["packages/billing/src/*"],
    "@repo/config": ["packages/config/src/index.ts"],
    "@repo/contracts": ["packages/contracts/src/index.ts"],
    "@repo/database": ["packages/database/src/index.ts"],
    "@repo/database/*": ["packages/database/src/*"],
    "@repo/email": ["packages/email/src/index.ts"],
    "@repo/kernel": ["packages/kernel/src/index.ts"],
    "@repo/modules": ["packages/modules/src/index.ts"],
    "@repo/modules/*": ["packages/modules/src/*"],
    "@repo/observability": ["packages/observability/src/index.ts"],
    "@repo/realtime": ["packages/realtime/src/index.ts"],
    "@repo/realtime/*": ["packages/realtime/src/*"],
    "@repo/services": ["packages/services/src/index.ts"],
    "@repo/services/*": ["packages/services/src/*"],
    "@repo/storage": ["packages/storage/src/index.ts"],
    "@repo/storage/*": ["packages/storage/src/*"],
    "@repo/ui": ["packages/ui/src/index.ts"],
    "@repo/ui/*": ["packages/ui/src/*"],
    "@repo/testing": ["packages/testing/src/index.ts"],
    "@repo/workflows": ["packages/workflows/src/index.ts"],
  };

  const explicitTanPaths: Record<string, string[]> = {
    "~/*": ["./src/*"],
    "@/*": ["./src/*"],
    "@repo/*": ["packages/*/src"],
    "@repo/api": ["packages/api/src/index.ts"],
    "@repo/analytics": ["packages/analytics/src/index.ts"],
    "@repo/auth": ["packages/auth/src/index.ts"],
    "@repo/billing": ["packages/billing/src/index.ts"],
    "@repo/config": ["packages/config/src/index.ts"],
    "@repo/contracts": ["packages/contracts/src/index.ts"],
    "@repo/database": ["packages/database/src/index.ts"],
    "@repo/email": ["packages/email/src/index.ts"],
    "@repo/kernel": ["packages/kernel/src/index.ts"],
    "@repo/modules": ["packages/modules/src/index.ts"],
    "@repo/observability": ["packages/observability/src/index.ts"],
    "@repo/realtime": ["packages/realtime/src/index.ts"],
    "@repo/services": ["packages/services/src/index.ts"],
    "@repo/storage": ["packages/storage/src/index.ts"],
    "@repo/ui": ["packages/ui/src/index.ts"],
    "@repo/testing": ["packages/testing/src/index.ts"],
    "@repo/workflows": ["packages/workflows/src/index.ts"],
  };

  const explicitExpoPaths: Record<string, string[]> = {
    "@/*": ["./src/*"],
    "@repo/*": ["packages/*/src", "tooling/*/src"],
  };

  const baseFiles: TemplateFile[] = [
    file(
      "packages/typescript-config/package.json",
      packageJson({ name: "@repo/typescript-config", private: true, scripts: {} }),
    ),
    file(
      "packages/typescript-config/base.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2024",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2024"],
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
            declarationMap: true,
            sourceMap: true,
            incremental: true,
            composite: false,
            paths: explicitBasePaths,
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/nextjs.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "preserve",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            incremental: true,
            composite: false,
            noEmit: true,
            types: ["bun-types", "node"],
            paths: explicitNextPaths,
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/tanstack.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            target: "ES2024",
            module: "ESNext",
            moduleResolution: "bundler",
            jsx: "react-jsx",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            types: ["vite/client", "bun-types", "node"],
            noEmit: true,
            incremental: true,
            composite: false,
            verbatimModuleSyntax: false,
            erasableSyntaxOnly: false,
            paths: explicitTanPaths,
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/react-library.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "react-jsx",
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            noEmit: true,
            incremental: true,
            composite: false,
            paths: {
              "@/*": ["./src/*"],
              "@repo/*": ["packages/*/src"],
            },
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/expo.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "react-jsx",
            lib: ["ES2024", "DOM"],
            noEmit: true,
            incremental: true,
            composite: false,
            paths: explicitExpoPaths,
            types: ["bun-types", "node"],
          },
        },
        null,
        2,
      ) + "\n",
    ),
  ];

  const webTsConfig = isTanstack
    ? file(
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
              paths: {
                "~/*": ["./src/*"],
                "@/*": ["./src/*"],
                "@repo/*": ["../../packages/*/src"],
                "@repo/api": ["../../packages/api/src/index.ts"],
                "@repo/auth": ["../../packages/auth/src/index.ts"],
                "@repo/auth/*": ["../../packages/auth/src/*"],
                "@repo/billing": ["../../packages/billing/src/index.ts"],
                "@repo/config": ["../../packages/config/src/index.ts"],
                "@repo/database": ["../../packages/database/src/index.ts"],
                "@repo/email": ["../../packages/email/src/index.ts"],
                "@repo/kernel": ["../../packages/kernel/src/index.ts"],
                "@repo/modules": ["../../packages/modules/src/index.ts"],
                "@repo/observability": ["../../packages/observability/src/index.ts"],
                "@repo/realtime": ["../../packages/realtime/src/index.ts"],
                "@repo/services": ["../../packages/services/src/index.ts"],
                "@repo/storage": ["../../packages/storage/src/index.ts"],
                "@repo/ui": ["../../packages/ui/src/index.ts"],
              },
              noEmit: true,
              incremental: true,
              composite: false,
              types: ["bun-types", "node", "vite/client"],
            },
            include: ["src/**/*", "vite.config.ts", "../..//packages/typescript-config/*.json"],
            exclude: ["node_modules", ".output", "dist", ".tanstack", ".vinxi"],
          },
          null,
          2,
        ) + "\n",
      )
    : file(
        "apps/web/tsconfig.json",
        JSON.stringify(
          {
            extends: "@repo/typescript-config/nextjs.json",
            compilerOptions: {
              paths: {
                "@/*": ["./src/*"],
                "@repo/*": ["../../packages/*/src"],
                "@repo/api": ["../../packages/api/src/index.ts"],
                "@repo/analytics": ["../../packages/analytics/src/index.ts"],
                "@repo/auth": ["../../packages/auth/src/index.ts"],
                "@repo/auth/*": ["../../packages/auth/src/*"],
                "@repo/billing": ["../../packages/billing/src/index.ts"],
                "@repo/billing/*": ["../../packages/billing/src/*"],
                "@repo/config": ["../../packages/config/src/index.ts"],
                "@repo/contracts": ["../../packages/contracts/src/index.ts"],
                "@repo/database": ["../../packages/database/src/index.ts"],
                "@repo/database/*": ["../../packages/database/src/*"],
                "@repo/email": ["../../packages/email/src/index.ts"],
                "@repo/kernel": ["../../packages/kernel/src/index.ts"],
                "@repo/modules": ["../../packages/modules/src/index.ts"],
                "@repo/modules/*": ["../../packages/modules/src/*"],
                "@repo/observability": ["../../packages/observability/src/index.ts"],
                "@repo/realtime": ["../../packages/realtime/src/index.ts"],
                "@repo/realtime/*": ["../../packages/realtime/src/*"],
                "@repo/services": ["../../packages/services/src/index.ts"],
                "@repo/services/*": ["../../packages/services/src/*"],
                "@repo/storage": ["../../packages/storage/src/index.ts"],
                "@repo/storage/*": ["../../packages/storage/src/*"],
                "@repo/ui": ["../../packages/ui/src/index.ts"],
                "@repo/ui/*": ["../../packages/ui/src/*"],
              },
              noEmit: true,
              incremental: true,
            },
            include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
            exclude: ["node_modules", ".next", "dist"],
          },
          null,
          2,
        ) + "\n",
      );

  const includeWeb = !apps || apps.includes("web");
  return includeWeb ? [...baseFiles, webTsConfig] : baseFiles;
}

export function appsComposerFiles(
  runtime: "node" | "bun",
  addons: AddonInstallerMap,
  framework: FrameworkName = "nextjs",
  appsOrFrameworkMaybe?: string[] | FrameworkName,
): TemplateFile[] {
  let effectiveFramework: FrameworkName = framework;
  let effectiveApps: string[] = ["web"];

  const maybe = appsOrFrameworkMaybe as unknown as string;
  if (
    Array.isArray(maybe) &&
    (maybe as string[]).some((a) => a === "web" || a === "mobile" || a === "desktop")
  ) {
    effectiveApps = maybe as string[];
  } else if (maybe === "web" || maybe === "mobile" || maybe === "desktop") {
    effectiveApps = [maybe as string];
  } else {
    const hasMobileAddon = hasAddon(addons, "mobile");
    const hasWebAddon = hasAddon(addons, "web");
    const hasDesktopAddon = hasAddon(addons, "desktop");
    if (hasMobileAddon || hasWebAddon || hasDesktopAddon) {
      effectiveApps = [
        ...(hasWebAddon ? ["web"] : []),
        ...(hasMobileAddon ? ["mobile"] : []),
        ...(hasDesktopAddon ? ["desktop"] : []),
      ];
    }
    if (effectiveApps.length === 0) effectiveApps = ["web"];
  }

  const hasWeb = effectiveApps.includes("web");
  const hasMobile = effectiveApps.includes("mobile");
  const hasDesktop = effectiveApps.includes("desktop");

  const webFiles = hasWeb ? appsFilesWithConditionalEve(runtime, addons, effectiveFramework) : [];
  const mobileFiles = hasMobile ? genExpoFiles(runtime, addons) : [];
  const desktopFiles = hasDesktop ? desktopCoreFiles(runtime, addons) : [];

  return [
    ...webFiles,
    ...mobileFiles,
    ...desktopFiles,
    ...typescriptConfigWithAliases(effectiveFramework, effectiveApps),
  ];
}
