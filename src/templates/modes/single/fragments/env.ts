import { file, type TemplateFile } from "../../../shared.js";
import type { AddonInstallerMap } from "../../../../lib/addons.js";
import { hasAddon } from "../../../../lib/addons.js";
import {
  configSafeIndexContent,
  desktopMainEnvContent,
  expoPublicEnvContent,
  nextPublicEnvContent,
  serverRuntimeContent,
  serverSchemaContent,
  vitePublicEnvContent,
  type ConfigDatabase,
} from "../../../packages/config.js";

function addonEnabled(
  map: AddonInstallerMap | Record<string, { inUse?: boolean }> | undefined,
  key: string,
): boolean {
  if (!map) return false;
  try {
    return hasAddon(map as AddonInstallerMap, key);
  } catch {
    return Boolean((map as Record<string, { inUse?: boolean }>)[key]?.inUse);
  }
}

function databaseFromMap(
  map?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
): ConfigDatabase {
  if (addonEnabled(map, "convex")) return "convex";
  if (addonEnabled(map, "database:none")) return "none";
  return "postgres";
}

export type SingleEnvFramework = "nextjs" | "tanstack-start" | "expo" | "desktop";

/** Compatibility helper for callers that need only the common server runtime. */
export function singleEnvContent(
  isConvex = false,
  _framework: SingleEnvFramework = "nextjs",
  hasEmail = true,
  hasCache = false,
  hasNotifications = false,
  hasEve = false,
): string {
  return serverRuntimeContent({
    database: isConvex ? "convex" : "postgres",
    hasEmail,
    hasCache,
    hasNotifications,
    hasEve,
  });
}

/** Emit isolated server, public-client, and Electron-main env modules in flat/single mode. */
export function singleEnvFiles(
  addonMap?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
  _framework: SingleEnvFramework = "nextjs",
  hasEmail = true,
): TemplateFile[] {
  const database = databaseFromMap(addonMap);
  const hasCache = addonEnabled(addonMap, "cache");
  const hasNotifications = addonEnabled(addonMap, "notifications");
  const hasEve = addonEnabled(addonMap, "eve");
  const isConvex = database === "convex";
  const options = { database, hasEmail, hasCache, hasNotifications, hasEve } as const;
  return [
    file("src/lib/env/server-schema.ts", serverSchemaContent(options)),
    file("src/lib/env/server.ts", serverRuntimeContent(options)),
    file("src/lib/env/next.ts", nextPublicEnvContent(isConvex)),
    file("src/lib/env/vite.ts", vitePublicEnvContent(isConvex)),
    file("src/lib/env/expo.ts", expoPublicEnvContent(isConvex)),
    file("src/lib/env/desktop-main.ts", desktopMainEnvContent()),
    file("src/lib/env/index.ts", configSafeIndexContent()),
  ];
}
