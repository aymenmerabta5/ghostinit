import type { ProjectConfig } from "../../../lib/config.js";
import type { TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import { buildAddonInstallerMap, hasAddon } from "../../../lib/addons.js";
import type {
  AddonInstallerMap,
  AppName,
  BillingProviderName,
  FrameworkName,
  ProjectMode,
  DatabaseProvider,
  FeatureName,
} from "../../../lib/addons.js";
import { buildSecrets, selectedBillingFromAddons } from "./utils.js";
import { rootComposerFiles } from "./root-composer.js";
import { packagesComposerFiles } from "./packages-composer.js";
import { databaseComposerFiles } from "./database-composer.js";
import { authComposerFiles } from "./auth-composer.js";
import { apiComposerFiles } from "./api-composer.js";
import { uiComposerFiles } from "./ui-composer.js";
import { modulesComposerFiles } from "./modules-composer.js";
import { appsComposerFiles } from "./apps-composer.js";
import { billingComposerFiles } from "./billing-composer.js";
import { servicesComposerFiles } from "./services-composer.js";
import { agentsComposerFiles } from "./agents-composer.js";

export interface MonorepoSecrets extends RootSecrets {}
export interface MonorepoContext {
  dryRun?: boolean;
}

type Runtime = "node" | "bun";

export function monorepoFiles(
  config: ProjectConfig,
  secrets: RootSecrets = buildSecrets(),
  ctx: MonorepoContext = { dryRun: false },
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const runtime = (config.runtime ?? "bun") as Runtime;
  const mode = (config.mode ?? "monorepo") as ProjectMode;
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
  const configuredFramework = config.framework as FrameworkName | undefined;
  const effectiveFramework = (configuredFramework ??
    (hasAddon(addonMap, "tanstack-start") ? "tanstack-start" : "nextjs")) as FrameworkName;
  const selectedBilling = selectedBillingFromAddons(addonMap as unknown as AddonInstallerMap);
  const effectiveBilling =
    selectedBilling.length > 0
      ? selectedBilling
      : ((config.billing ?? []) as BillingProviderName[]);

  let effectiveApps: AppName[];
  const cfgApps = config.apps as AppName[] | undefined;
  if (cfgApps && Array.isArray(cfgApps) && cfgApps.length > 0) {
    effectiveApps = cfgApps;
  } else {
    const hasWeb = hasAddon(addonMap, "web");
    const hasMobile = hasAddon(addonMap, "mobile");
    if (hasWeb || hasMobile) {
      effectiveApps = [
        ...(hasWeb ? (["web"] as AppName[]) : []),
        ...(hasMobile ? (["mobile"] as AppName[]) : []),
      ] as AppName[];
    } else {
      effectiveApps = ["web"] as AppName[];
    }
  }

  const all: TemplateFile[] = [
    ...rootComposerFiles(config.name, secrets, ctx, runtime, effectiveBilling),
    ...packagesComposerFiles(runtime),
    ...databaseComposerFiles(config.name, runtime),
    ...authComposerFiles(effectiveFramework),
    ...apiComposerFiles(),
    ...uiComposerFiles(),
    ...modulesComposerFiles(runtime),
    ...appsComposerFiles(runtime, addonMap, effectiveFramework, effectiveApps),
    ...servicesComposerFiles(config.name, runtime, addonMap, hasEve, hasI18n, effectiveFramework),
    ...billingComposerFiles("monorepo", runtime, addonMap, effectiveBilling),
  ];

  const enrichedAgents = agentsComposerFiles(
    config.name,
    effectiveBilling,
    hasEve,
    hasI18n,
    effectiveFramework,
  );
  const withoutOldAgents = all.filter(
    (f: TemplateFile) =>
      ![
        "AGENTS.md",
        "CLAUDE.md",
        ".cursor/rules/ghostinit.mdc",
        ".windsurf/rules/ghostinit.md",
      ].includes(f.path),
  );
  const merged = [...withoutOldAgents, ...enrichedAgents];

  const dedup = new Map<string, TemplateFile>();
  for (const f of merged) dedup.set(f.path, f);

  const hasWeb = effectiveApps.includes("web" as AppName);
  const hasMobile = effectiveApps.includes("mobile" as AppName);
  let filteredFiles = [...dedup.values()];
  if (!hasWeb) filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("apps/web/"));
  if (!hasMobile) filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("apps/mobile/"));

  const tsIdx = filteredFiles.findIndex((f) => f.path === "tsconfig.json");
  if (tsIdx !== -1) {
    try {
      const parsed = JSON.parse(filteredFiles[tsIdx].content) as {
        references?: Array<{ path: string }>;
      };
      if (Array.isArray(parsed.references)) {
        parsed.references = parsed.references.filter((r: { path: string }) => {
          const p = r.path;
          if (p.startsWith("apps/")) {
            const appName = p.split("/")[1];
            return effectiveApps.includes(appName as AppName);
          }
          return true;
        });
        filteredFiles[tsIdx] = {
          ...filteredFiles[tsIdx],
          content: `${JSON.stringify(parsed, null, 2)}\n`,
        };
      }
    } catch {}
  }

  const finalFiles = filteredFiles.sort((a: TemplateFile, b: TemplateFile) =>
    a.path.localeCompare(b.path),
  );

  return finalFiles.map((f: TemplateFile) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}

export const monorepoTemplateFiles = monorepoFiles;
export default monorepoFiles;
