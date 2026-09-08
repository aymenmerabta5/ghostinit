// @allow-long 430: assembles app files plus the tsconfig path-alias matrix for every framework; the alias tables are data, and separating them from their consumer invites drift
import type { TemplateFile } from "../../shared.js";
import { file, packageJson } from "../../shared.js";
import {
  appsFiles as genAppsFiles,
  tanstackStartFiles as genTanstackFiles,
  expoFiles as genExpoFiles,
} from "../../apps/index.js";
import { desktopCoreFiles } from "../../apps/desktop/index.js";
import type { AddonInstallerMap, AppName, FrameworkName } from "../../../lib/addons.js";
import { hasAddon } from "../../../lib/addons.js";
import { integrateDesignSystemApplications, resolveDesignSystemApps } from "../../ui/index.js";
import { NEXT_COMPILER_OPTIONS, NEXT_TYPE_INCLUDES } from "../../tooling/next-typescript.js";

function appFilesForFramework(
  runtime: "node" | "bun",
  addons: AddonInstallerMap,
  framework: FrameworkName = "nextjs",
  _hasEmail = true,
): TemplateFile[] {
  const isTanstack = framework === "tanstack-start" || hasAddon(addons, "tanstack-start");
  return isTanstack ? genTanstackFiles(runtime, addons) : genAppsFiles(runtime, addons);
}

function typescriptConfigWithAliases(
  framework: FrameworkName = "nextjs",
  apps?: string[],
): TemplateFile[] {
  const isTanstack = framework === "tanstack-start";
  const fromConfigPackage = (paths: Record<string, string[]>): Record<string, string[]> =>
    Object.fromEntries(
      Object.entries(paths).map(([alias, targets]) => [
        alias,
        targets.map((target) =>
          target.startsWith("./") || target.startsWith("../") ? target : `../../${target}`,
        ),
      ]),
    );
  const configSourcePaths: Record<string, string[]> = {
    "@repo/config": ["packages/config/src/index.ts"],
    "@repo/config/server": ["packages/config/src/server.ts"],
    "@repo/config/desktop-main": ["packages/config/src/desktop-main.ts"],
    "@repo/config/next": ["packages/config/src/next.ts"],
    "@repo/config/vite": ["packages/config/src/vite.ts"],
    "@repo/config/expo": ["packages/config/src/expo.ts"],
  };
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
    ...configSourcePaths,
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
    ...configSourcePaths,
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
    ...configSourcePaths,
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
    "@repo/ui/*": ["packages/ui/src/*"],
    "@repo/testing": ["packages/testing/src/index.ts"],
    "@repo/workflows": ["packages/workflows/src/index.ts"],
  };

  const explicitExpoPaths: Record<string, string[]> = {
    "@/*": ["./src/*"],
    "@repo/*": ["packages/*/src", "tooling/*/src"],
    ...configSourcePaths,
    "@repo/ui": ["packages/ui/src/index.ts"],
    "@repo/ui/*": ["packages/ui/src/*"],
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
            paths: fromConfigPackage(explicitBasePaths),
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
            ...NEXT_COMPILER_OPTIONS,
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            incremental: true,
            composite: false,
            types: ["bun-types", "node"],
            paths: fromConfigPackage(explicitNextPaths),
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
            paths: fromConfigPackage(explicitTanPaths),
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
            paths: fromConfigPackage({
              "@/*": ["./src/*"],
              "@repo/*": ["packages/*/src"],
              ...configSourcePaths,
              "@repo/ui": ["packages/ui/src/index.ts"],
              "@repo/ui/*": ["packages/ui/src/*"],
            }),
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
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            noEmit: true,
            incremental: true,
            composite: false,
            paths: fromConfigPackage(explicitExpoPaths),
            types: ["bun-types", "node", "expo/types"],
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
                ...fromConfigPackage(configSourcePaths),
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
                "@repo/ui/*": ["../../packages/ui/src/*"],
              },
              noEmit: true,
              incremental: true,
              composite: false,
              types: ["bun-types", "node", "vite/client"],
            },
            include: [
              "src/**/*",
              "server/**/*",
              "vite.config.ts",
              "nitro.config.ts",
              "../..//packages/typescript-config/*.json",
            ],
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
                ...fromConfigPackage(configSourcePaths),
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
            include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ...NEXT_TYPE_INCLUDES],
            exclude: ["node_modules", ".ghostinit", "dist"],
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
  hasEmail = true,
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

  const webFiles = hasWeb
    ? appFilesForFramework(runtime, addons, effectiveFramework, hasEmail)
    : [];
  const mobileFiles = hasMobile ? genExpoFiles(runtime, addons) : [];
  const desktopFiles = hasDesktop ? desktopCoreFiles(runtime, addons) : [];

  return integrateDesignSystemApplications(
    [
      ...webFiles,
      ...mobileFiles,
      ...desktopFiles,
      ...typescriptConfigWithAliases(effectiveFramework, effectiveApps),
    ],
    "monorepo",
    resolveDesignSystemApps(effectiveApps as AppName[], effectiveFramework),
  );
}
