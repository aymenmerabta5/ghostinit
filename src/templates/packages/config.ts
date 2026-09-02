import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { EnvAudience } from "../shared/env/core.js";
import {
  configSafeIndexContent,
  desktopMainEnvContent,
  expoPublicEnvContent,
  nextPublicEnvContent,
  serverRuntimeContent,
  serverSchemaContent,
  vitePublicEnvContent,
  type ConfigDatabase,
} from "./config-content.js";

export {
  EXPO_CLIENT_RUNTIME,
  EXPO_CLIENT_VARS,
  NEXT_PUBLIC_CLIENT_VARS,
  VITE_CLIENT_VARS,
  clientRuntimeEnvLines,
  configSafeIndexContent,
  desktopMainEnvContent,
  expoPublicEnvContent,
  nextPublicEnvContent,
  serverRuntimeContent,
  serverSchemaContent,
  vitePublicEnvContent,
} from "./config-content.js";
export type { ConfigDatabase, ServerEnvTemplateOptions } from "./config-content.js";

export type ConfigFramework = "nextjs" | "tanstack-start";

/**
 * Emit one server-only runtime, three isolated public runtimes, and a
 * non-secret Electron-main endpoint entry.
 * The root barrel is type/value safe and never imports or re-exports an env value.
 * Mixed app workspaces therefore validate every public prefix without placing
 * server secrets in any client-reachable module graph.
 */
export function configPackageFiles(
  framework: ConfigFramework = "nextjs",
  database: ConfigDatabase = "postgres",
  hasEmail = true,
  audience: EnvAudience = {
    framework,
    hasWeb: true,
    hasMobile: false,
    hasDesktop: false,
  },
  hasNotifications = false,
  hasCache = false,
  hasEve = false,
): TemplateFile[] {
  void framework;
  void audience;
  const isConvex = database === "convex";
  const serverOptions = { database, hasEmail, hasCache, hasNotifications, hasEve } as const;

  return [
    file(
      "packages/config/package.json",
      packageJson({
        name: "@repo/config",
        exports: {
          ".": "./src/index.ts",
          "./server": "./src/server.ts",
          "./next": "./src/next.ts",
          "./vite": "./src/vite.ts",
          "./expo": "./src/expo.ts",
          "./desktop-main": "./src/desktop-main.ts",
        },
        scripts: codeScripts(),
        dependencies: {
          "@t3-oss/env-core": `^${v.validation["@t3-oss/env-core"]}`,
          "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
          zod: `^${v.validation.zod}`,
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/config/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          composite: true,
          incremental: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          outDir: "./dist",
          rootDir: "./src",
          paths: { "@/*": ["./src/*"], "@repo/*": ["../../packages/*/src"] },
        },
      }),
    ),
    file("packages/config/src/server-schema.ts", serverSchemaContent(serverOptions)),
    file("packages/config/src/server.ts", serverRuntimeContent(serverOptions)),
    file("packages/config/src/next.ts", nextPublicEnvContent(isConvex)),
    file("packages/config/src/vite.ts", vitePublicEnvContent(isConvex)),
    file("packages/config/src/expo.ts", expoPublicEnvContent(isConvex)),
    file("packages/config/src/desktop-main.ts", desktopMainEnvContent()),
    file("packages/config/src/index.ts", configSafeIndexContent()),
  ];
}
