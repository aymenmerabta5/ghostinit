import type { TemplateFile } from "../shared.js";
import { tsConfigFiles } from "./typescript-config.js";
import { configPackageFiles, type ConfigFramework } from "./config.js";
import { corePackagesFiles } from "./core.js";
import type { EnvAudience } from "../shared/env/core.js";

export function packageFiles(
  runtime: "node" | "bun" = "bun",
  // @repo/config emits isolated server/next/vite/expo/desktop-main entries;
  // public .env lines remain filtered to the selected application audience.
  framework: ConfigFramework = "nextjs",
  database: "postgres" | "convex" | "none" = "postgres",
  hasEmail = true,
  audience?: EnvAudience,
  hasNotifications = false,
  hasCache = false,
  hasEve = false,
): TemplateFile[] {
  return [
    ...tsConfigFiles(),
    ...configPackageFiles(
      framework,
      database,
      hasEmail,
      audience,
      hasNotifications,
      hasCache,
      hasEve,
    ),
    ...corePackagesFiles(runtime),
  ];
}
