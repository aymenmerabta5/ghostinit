// @allow-long 6-imports: root composer aggregates files+env+turbo with framework/app filtering
import type { TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import { rootFiles as genRootFiles } from "../../root.js";
import {
  hasAddon,
  type AddonInstallerMap,
  type BillingProviderName,
  type DatabaseProvider,
} from "../../../lib/addons.js";
import { filteredEnvExample, filteredEnvLocal } from "./utils.js";
import type { FrameworkName, AppName } from "../../../lib/addons.js";

type Runtime = "node" | "bun";
type GenerateCtx = { dryRun?: boolean };

export function rootComposerFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateCtx,
  runtime: Runtime,
  selectedBilling: BillingProviderName[],
  addonMap?: AddonInstallerMap,
  database: "postgres" | "convex" | "none" | string = "postgres",
  framework?: FrameworkName,
  apps?: AppName[],
  deploy: string = "none",
  hasEmail = true,
): TemplateFile[] {
  const effectiveDb = (database ?? "postgres") as DatabaseProvider;
  const effectiveFramework = framework ?? "nextjs";
  const effectiveApps = apps ?? (["web"] as AppName[]);
  const profile = {
    mode: "monorepo" as const,
    database: effectiveDb,
    framework: effectiveFramework,
    apps: effectiveApps,
    messaging: addonMap ? hasAddon(addonMap, "messaging") : false,
    jobs: addonMap ? hasAddon(addonMap, "jobs") : false,
    storage: addonMap ? hasAddon(addonMap, "storage") : false,
    notifications: addonMap ? hasAddon(addonMap, "notifications") : false,
    cache: addonMap ? hasAddon(addonMap, "cache") : false,
    billing: selectedBilling,
    email: hasEmail,
    api: addonMap ? hasAddon(addonMap, "api") : true,
    auth: addonMap ? hasAddon(addonMap, "auth") : true,
    pdf: addonMap ? hasAddon(addonMap, "pdf") : false,
    eve: addonMap ? hasAddon(addonMap, "eve") : false,
  };
  const raw = genRootFiles(
    projectName,
    secrets,
    { dryRun: Boolean(ctx.dryRun) },
    runtime,
    addonMap as AddonInstallerMap,
    deploy as unknown as import("../../../lib/addons.js").DeployTarget,
    profile,
  );
  // Only emit the public env prefix the project actually validates.
  const audience = {
    framework: effectiveFramework,
    hasWeb: effectiveApps.includes("web" as AppName),
    hasMobile: effectiveApps.includes("mobile" as AppName),
    hasDesktop: effectiveApps.includes("desktop" as AppName),
    hasEve: profile.eve,
  };
  const filteredExample = filteredEnvExample(
    projectName,
    secrets,
    selectedBilling,
    hasEmail,
    runtime,
    effectiveDb,
    audience,
  );
  const filteredLocal = filteredEnvLocal(
    projectName,
    secrets,
    selectedBilling,
    runtime,
    effectiveDb,
    audience,
    hasEmail,
  );
  return raw.map((f: TemplateFile) => {
    if (f.path === ".env.example") return filteredExample;
    if (f.path === ".env.local") return filteredLocal;
    if (f.path === "apps/web/.env.local") {
      return { ...filteredLocal, path: "apps/web/.env.local" };
    }
    return f;
  });
}
