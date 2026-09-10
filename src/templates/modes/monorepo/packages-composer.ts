import type { TemplateFile } from "../../shared.js";
import { packageFiles as genPackageFiles } from "../../packages.js";
import { analyticsFiles as genAnalyticsFiles } from "../../analytics.js";
import type { AppName, DeployTarget } from "../../../lib/addons.js";

type Runtime = "node" | "bun";

export function packagesComposerFiles(
  runtime: Runtime,
  framework: "nextjs" | "tanstack-start" = "nextjs",
  database: "postgres" | "convex" | "none" = "postgres",
  hasAnalytics = true,
  hasEmail = true,
  apps: readonly AppName[] = ["web"],
  hasNotifications = false,
  hasCache = false,
  hasEve = false,
  deploy: DeployTarget = "none",
): TemplateFile[] {
  const pkgRaw = genPackageFiles(
    runtime,
    framework,
    database,
    hasEmail,
    {
      framework,
      hasWeb: apps.includes("web"),
      hasMobile: apps.includes("mobile"),
      hasDesktop: apps.includes("desktop"),
    },
    hasNotifications,
    hasCache,
    hasEve,
  );
  const pkgFiltered = pkgRaw.filter(
    (f: TemplateFile) => !f.path.startsWith("packages/typescript-config/"),
  );
  return [
    ...pkgFiltered,
    ...(hasAnalytics ? genAnalyticsFiles({ mode: "monorepo", runtime, framework, deploy }) : []),
  ];
}
