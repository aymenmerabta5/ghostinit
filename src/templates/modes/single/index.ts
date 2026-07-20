import { type TemplateFile } from "../../shared.js";
import type { ProjectConfig } from "../../../lib/config.js";
import type { RootSecrets } from "../../root.js";
import {
  type AddonInstallerMap,
  type BillingProviderName,
  type AppName,
  type ProjectMode,
  type DatabaseProvider,
  type FrameworkName,
  type FeatureName,
  buildAddonInstallerMap,
  hasAddon,
} from "../../../lib/addons.js";
import { buildSecrets, selectedBillingFromAddons } from "./config.js";
import {
  updatedAgentsMd,
  claudeMdFromAgents,
  cursorRulesFromAgents,
  windsurfFromAgents,
} from "./fragments/docs.js";
import { buildNextFiles } from "./composers/next.js";
import { buildTanstackFiles } from "./composers/tanstack.js";
import { buildExpoFiles } from "./composers/expo.js";

export interface SingleContext {
  dryRun?: boolean;
}

type Runtime = "node" | "bun";

export function singleFiles(
  config: ProjectConfig,
  secrets: RootSecrets = buildSecrets(),
  ctx: SingleContext = { dryRun: false },
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const runtime = (config.runtime ?? "bun") as Runtime;
  const mode = (config.mode ?? "single") as ProjectMode;
  const addonMap: AddonInstallerMap =
    addons ??
    buildAddonInstallerMap({
      billing: (config.billing ?? []) as BillingProviderName[],
      features: (config.features ?? []) as FeatureName[],
      database: (config.database ?? "postgres") as DatabaseProvider,
      mode,
      framework: (config.framework ?? "nextjs") as FrameworkName,
      apps: (config.apps ?? ["web"]) as AppName[],
    });

  const hasEve = Boolean(
    hasAddon(addonMap, "eve") || (config.features ?? []).includes("eve" as FeatureName),
  );
  const hasI18n = Boolean(
    hasAddon(addonMap, "i18n") || (config.features ?? []).includes("i18n" as FeatureName),
  );
  const selectedBilling = selectedBillingFromAddons(addonMap);
  const effectiveBilling: BillingProviderName[] =
    selectedBilling.length > 0
      ? selectedBilling
      : ((config.billing ?? []) as BillingProviderName[]);

  const effectiveApps: string[] = ((): string[] => {
    const cfgApps = config.apps as string[] | undefined;
    if (cfgApps && cfgApps.length > 0) return cfgApps;
    if (hasAddon(addonMap, "mobile")) return ["mobile"];
    return ["web"];
  })();

  const cfgFramework = config.framework as FrameworkName | undefined;
  const framework = (cfgFramework ??
    (hasAddon(addonMap, "tanstack-start") ? "tanstack-start" : "nextjs")) as FrameworkName;

  const isMobileOnly = effectiveApps.includes("mobile") && !effectiveApps.includes("web");

  const files = isMobileOnly
    ? buildExpoFiles(config.name, runtime, effectiveBilling, hasEve, hasI18n, secrets, addonMap)
    : framework === "tanstack-start"
      ? buildTanstackFiles(
          config.name,
          runtime,
          effectiveBilling,
          hasEve,
          hasI18n,
          secrets,
          addonMap,
        )
      : buildNextFiles(config.name, runtime, effectiveBilling, hasEve, secrets, addonMap);

  const enrichedAgents = updatedAgentsMd(config.name, effectiveBilling, hasEve, hasI18n);
  const withoutOld = files.filter(
    (f) =>
      ![
        "AGENTS.md",
        "CLAUDE.md",
        ".cursor/rules/ghostinit.mdc",
        ".windsurf/rules/ghostinit.md",
      ].includes(f.path),
  );
  withoutOld.push(
    enrichedAgents,
    claudeMdFromAgents(enrichedAgents),
    cursorRulesFromAgents(enrichedAgents),
    windsurfFromAgents(enrichedAgents),
  );

  const dedup = new Map<string, TemplateFile>();
  for (const f of withoutOld) dedup.set(f.path, f);
  const finalFiles = [...dedup.values()].sort((a, b) => a.path.localeCompare(b.path));

  return finalFiles.map((f) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}

export const singleTemplateFiles = singleFiles;
export default singleFiles;
export { buildSecrets, selectedBillingFromAddons } from "./config.js";
export { singlePackageJson, singlePackageJsonTanstack } from "./package.js";
