import type { ProjectConfig } from "../../../lib/config.js";
import type { TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import { buildAddonInstallerMap } from "../../../lib/addons.js";
import type { AddonInstallerMap, BillingProviderName, FrameworkName } from "../../../lib/addons.js";
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

export function monorepoFiles(
  config: ProjectConfig,
  secrets: RootSecrets = buildSecrets(),
  ctx: MonorepoContext = { dryRun: false },
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const runtime = (config.runtime ?? "bun") as "node" | "bun";
  const mode = (config.mode ?? "monorepo") as "monorepo" | "single";
  const addonMap: AddonInstallerMap =
    (addons as AddonInstallerMap) ??
    buildAddonInstallerMap({
      billing: (config.billing ?? []) as any,
      features: (config.features ?? []) as any,
      database: (config.database ?? "postgres") as any,
      mode: mode as any,
      framework: (config.framework ?? "nextjs") as any,
    });

  const hasEve = Boolean(
    (addonMap as any).eve?.inUse ?? (config.features ?? []).includes("eve" as any),
  );
  const hasI18n = Boolean(
    (addonMap as any).i18n?.inUse ?? (config.features ?? []).includes("i18n" as any),
  );
  const configuredFramework = (config as any).framework as FrameworkName | undefined;
  const effectiveFramework = (configuredFramework ??
    ((addonMap as any)?.["tanstack-start"]?.inUse ? "tanstack-start" : "nextjs")) as FrameworkName;
  const selectedBilling = selectedBillingFromAddons(addonMap as any);
  const effectiveBilling =
    selectedBilling.length > 0
      ? selectedBilling
      : ((config.billing ?? []) as BillingProviderName[]);

  const all: TemplateFile[] = [
    ...rootComposerFiles(config.name, secrets, ctx, runtime as any, effectiveBilling),
    ...packagesComposerFiles(runtime as any),
    ...databaseComposerFiles(config.name, runtime as any),
    ...authComposerFiles(effectiveFramework),
    ...apiComposerFiles(),
    ...uiComposerFiles(),
    ...modulesComposerFiles(runtime as any),
    ...appsComposerFiles(runtime as any, addonMap, effectiveFramework),
    ...servicesComposerFiles(
      config.name,
      runtime as any,
      addonMap,
      hasEve,
      hasI18n,
      effectiveFramework,
    ),
    ...billingComposerFiles("monorepo", runtime as any, addonMap, effectiveBilling),
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
  const finalFiles = [...dedup.values()].sort((a: TemplateFile, b: TemplateFile) =>
    a.path.localeCompare(b.path),
  );

  return finalFiles.map((f: TemplateFile) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}

export const monorepoTemplateFiles = monorepoFiles;
export default monorepoFiles;
