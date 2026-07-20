/**
 * Expo core template — Expo Router + Metro + Babel
 * Minimal mobile app scaffold with oRPC client, better-auth, TanStack Query/Form, shared @repo/* workspaces.
 * Deduplicated via shared.js helpers (packageJson sorts deps, file guards traversal).
 */

import { codeScripts, file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap, BillingProviderName } from "../../lib/addons.js";
import { mobileGlobalCssContent } from "./fragments/css.js";

type FeatureInput =
  | boolean
  | AddonInstallerMap
  | Record<string, { inUse: boolean }>
  | BillingProviderName[];

function resolveHasFeature(input: FeatureInput = false, feature: string): boolean {
  if (typeof input === "boolean") return input;
  if (Array.isArray(input)) return false;
  const rec = input as Record<string, { inUse?: boolean }>;
  return Boolean(rec[feature]?.inUse);
}

function resolveHasEve(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "eve");
}

function resolveHasI18n(input: FeatureInput = false): boolean {
  return resolveHasFeature(input, "i18n");
}

export function expoCoreFiles(
  runtime: "node" | "bun" = "bun",
  hasEveInput: FeatureInput = false,
  hasI18nInput: FeatureInput = false,
): TemplateFile[] {
  const hasEve = resolveHasEve(hasEveInput);
  const hasI18n = resolveHasI18n(hasI18nInput ?? hasEveInput);
  const effectiveHasI18n = typeof hasEveInput !== "boolean" ? resolveHasI18n(hasEveInput) : hasI18n;
  return [
    webPackageMobile(runtime, hasEve, effectiveHasI18n),
    appJson(),
    babelConfig(),
    metroConfig(),
    file("apps/mobile/global.css", mobileGlobalCssContent()),
    expoEnvDts(),
    tsconfigMobile(),
  ];
}

/* ------------------------------------------------------------------ */
/* package.json — apps/mobile                                         */
/* ------------------------------------------------------------------ */

export function webPackageMobile(
  runtime: "node" | "bun" = "bun",
  _hasEve = false,
  _hasI18n = false,
): TemplateFile {
  return file(
    "apps/mobile/package.json",
    packageJson({
      name: "mobile",
      main: "expo-router/entry",
      version: v.ghostinitVersion,
      packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
      scripts: {
        dev: "expo start --port 19000",
        android: "expo start --android",
        ios: "expo start --ios",
        web: "expo start --web",
        build: "expo export",
        ...codeScripts({
          test: runtime === "bun" ? "bun test tests" : "npm run test:unit",
        }),
      },
      dependencies: {
        "@expo/metro-runtime": `^${v.expo["@expo/metro-runtime"]}`,
        "@orpc/client": `^${v.orpc["@orpc/client"]}`,
        "@orpc/react-query": `^${v.orpc["@orpc/react-query"]}`,
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
        "better-auth": `^${v.auth["better-auth"]}`,
        expo: `^${v.expo.expo}`,
        "expo-constants": `^${v.expo["expo-constants"]}`,
        "expo-linking": `^${v.expo["expo-linking"]}`,
        "expo-router": `^${v.expo["expo-router"]}`,
        "expo-secure-store": `^${v.expo["expo-secure-store"]}`,
        "expo-status-bar": `^${v.expo["expo-status-bar"]}`,
        "expo-web-browser": `^${v.expo["expo-web-browser"]}`,
        react: `^${v.nextStack.react}`,
        "react-native": `^${(v.expo["react-native"] as string) ?? "0.81.4"}`,
        "react-native-safe-area-context": `^${v.expo["react-native-safe-area-context"]}`,
        "react-native-web": `^${v.expo["react-native-web"]}`,
        "react-native-reanimated": `^${v.reanimated["react-native-reanimated"]}`,
        "tailwind-variants": `^${v.uniwind["tailwind-variants"]}`,
        "tw-animate-css": `^${v.uniwind["tw-animate-css"]}`,
        uniwind: `^${v.uniwind.uniwind}`,
        zod: `^${v.validation.zod}`,
      },
      devDependencies: {
        "@repo/typescript-config": "workspace:*",
        "@types/node": `^${v.runtime["@types/node"]}`,
        "@types/react": `^${v.nextStack["@types/react"]}`,
        "babel-preset-expo": `^${v.expo["babel-preset-expo"]}`,
        oxfmt: `^${v.tooling.oxfmt}`,
        oxlint: `^${v.tooling.oxlint}`,
        typescript: `^${v.typescript.typescript}`,
      },
    }),
  );
}

/* alias for clarity — consumers may import mobilePackage */
export const mobilePackage = webPackageMobile;
export const expoPackage = webPackageMobile;
export const expoPackageMobile = webPackageMobile;

/* ------------------------------------------------------------------ */
/* app.json                                                          */
/* ------------------------------------------------------------------ */

export function expoAppJsonContent(): string {
  return (
    JSON.stringify(
      {
        expo: {
          name: "__PROJECT_NAME__",
          slug: "__PROJECT_NAME__",
          scheme: "__PROJECT_NAME__",
          version: "1.0.0",
          orientation: "portrait",
          icon: "./assets/icon.png",
          userInterfaceStyle: "automatic",
          splash: {
            image: "./assets/splash.png",
            resizeMode: "contain",
            backgroundColor: "#ffffff",
          },
          assetBundlePatterns: ["**/*"],
          ios: {
            supportsTablet: true,
          },
          android: {
            adaptiveIcon: {
              foregroundImage: "./assets/adaptive-icon.png",
              backgroundColor: "#ffffff",
            },
          },
          web: {
            favicon: "./assets/favicon.png",
          },
          plugins: ["expo-router", "expo-secure-store"],
          experiments: {
            typedRoutes: true,
          },
          platforms: ["ios", "android", "web"],
        },
      },
      null,
      2,
    ) + "\n"
  );
}

export const appJsonContent = expoAppJsonContent;

export function appJson(): TemplateFile {
  return file("apps/mobile/app.json", expoAppJsonContent());
}

/** Single-mode reuse: file path differs but content identical — caller can wrap with file(). */
export function expoAppJsonContentSingle(): string {
  return expoAppJsonContent();
}

export function expoAppJsonSingle(): TemplateFile {
  return file("app.json", expoAppJsonContent());
}

/* ------------------------------------------------------------------ */
/* babel.config.js                                                   */
/* ------------------------------------------------------------------ */

export function babelConfigContent(): string {
  return `module.exports = function(api){api.cache(true); return {presets:[['uniwind/babel', { cssEntryFile: './global.css' }],'babel-preset-expo']};};
`;
}

export function babelConfig(): TemplateFile {
  return file("apps/mobile/babel.config.js", babelConfigContent());
}

export function babelConfigSingle(): TemplateFile {
  return file("babel.config.js", babelConfigContent());
}

/* ------------------------------------------------------------------ */
/* metro.config.js                                                   */
/* ------------------------------------------------------------------ */

export function metroConfigContent(): string {
  return `const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const config = getDefaultConfig(__dirname);
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});
`;
}

export function metroConfig(): TemplateFile {
  return file("apps/mobile/metro.config.js", metroConfigContent());
}

export function metroConfigSingle(): TemplateFile {
  return file("metro.config.js", metroConfigContent());
}

/* ------------------------------------------------------------------ */
/* expo-env.d.ts                                                     */
/* ------------------------------------------------------------------ */

export function expoEnvDtsContent(): string {
  return '/// <reference types="expo/types" />\n';
}

export function expoEnvDts(): TemplateFile {
  return file("apps/mobile/expo-env.d.ts", expoEnvDtsContent());
}

export function expoEnvDtsSingle(): TemplateFile {
  return file("expo-env.d.ts", expoEnvDtsContent());
}

/* ------------------------------------------------------------------ */
/* src/lib/utils.ts — cn helper                                      */
/* ------------------------------------------------------------------ */

export function expoLibUtilsContent(): string {
  return `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`;
}

/* ------------------------------------------------------------------ */
/* tsconfig.json — extends @repo/typescript-config/expo.json         */
/* ------------------------------------------------------------------ */

export function mobileTsconfigContent(): string {
  return (
    JSON.stringify(
      {
        extends: "@repo/typescript-config/expo.json",
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "@repo/*": ["../../packages/*/src"],
          },
        },
        include: [
          "**/*.ts",
          "**/*.tsx",
          ".expo/types/**/*.ts",
          "expo-env.d.ts",
          "uniwind-types.d.ts",
          "global.css",
        ],
        exclude: ["node_modules"],
      },
      null,
      2,
    ) + "\n"
  );
}

export const expoTsconfigContent = mobileTsconfigContent;
export const tsconfigContent = mobileTsconfigContent;

export function tsconfigMobile(): TemplateFile {
  return file("apps/mobile/tsconfig.json", mobileTsconfigContent());
}

export function tsconfigMobileSingle(): TemplateFile {
  return file("tsconfig.json", mobileTsconfigContent());
}
