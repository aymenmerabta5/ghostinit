import { type TemplateFile } from "../../shared.js";
import type { ProjectConfig } from "../../../lib/config.js";
import type { RootSecrets } from "../../root.js";
import type { AddonInstallerMap, BillingProviderName } from "../../../lib/addons.js";
import { buildAddonInstallerMap } from "../../../lib/addons.js";
import { buildSecrets, selectedBillingFromAddons } from "./config.js";
import {
  updatedAgentsMd,
  claudeMdFromAgents,
  cursorRulesFromAgents,
  windsurfFromAgents,
} from "./fragments/docs.js";
import { buildNextFiles } from "./composers/next.js";
import { buildTanstackFiles } from "./composers/tanstack.js";

export interface SingleContext {
  dryRun?: boolean;
}

export function singleFiles(
  config: ProjectConfig,
  secrets: RootSecrets = buildSecrets(),
  ctx: SingleContext = { dryRun: false },
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const runtime = (config.runtime ?? "bun") as "node" | "bun";
  const mode = (config.mode ?? "single") as "monorepo" | "single";
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
  const selectedBilling = selectedBillingFromAddons(addonMap);
  const effectiveBilling: BillingProviderName[] =
    selectedBilling.length > 0
      ? selectedBilling
      : ((config.billing ?? []) as BillingProviderName[]);
  const framework =
    (config as any).framework ??
    ((addonMap as any)["tanstack-start"]?.inUse ? "tanstack-start" : "nextjs");

  const files =
    framework === "tanstack-start"
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
