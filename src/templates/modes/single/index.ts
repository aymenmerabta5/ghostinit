// @allow-long 13-imports: single/index mirrors monorepo assembly for single mode — intentional
import { dedupeFilesOrThrow, type TemplateFile } from "../../shared.js";
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
  type PresetName,
  type CacheProvider,
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
import { proxyFiles } from "../../proxy.js";
import { accessFiles } from "../../access.js";
import { shellFiles } from "../../shell.js";
import { buildExpoFiles } from "./composers/expo.js";
import { buildDesktopFiles } from "./composers/desktop.js";

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
  const preset = (config.preset ?? "saas") as PresetName;
  const cache = (config.cache ?? "none") as CacheProvider;
  const addonMap: AddonInstallerMap =
    addons ??
    buildAddonInstallerMap({
      billing: (config.billing ?? []) as BillingProviderName[],
      features: (config.features ?? []) as FeatureName[],
      database: (config.database ?? "postgres") as DatabaseProvider,
      mode,
      framework: (config.framework ?? "nextjs") as FrameworkName,
      apps: (config.apps ?? ["web"]) as AppName[],
      preset,
      cache,
      auth: config.auth,
      api: config.api,
      email: config.email,
      analytics: config.analytics,
      eve: config.eve,
      i18n: config.i18n,
    });

  const hasEve = Boolean(
    hasAddon(addonMap, "eve") ||
    (config.features ?? []).includes("eve" as FeatureName) ||
    config.eve,
  );
  const hasI18n = Boolean(
    hasAddon(addonMap, "i18n") ||
    (config.features ?? []).includes("i18n" as FeatureName) ||
    config.i18n,
  );
  const selectedBilling = selectedBillingFromAddons(addonMap);
  const effectiveBilling: BillingProviderName[] =
    selectedBilling.length > 0
      ? selectedBilling
      : ((config.billing ?? []) as BillingProviderName[]);

  const effectiveApps: string[] = ((): string[] => {
    const cfgApps = config.apps as string[] | undefined;
    if (cfgApps && cfgApps.length > 0) return cfgApps;
    if (hasAddon(addonMap, "desktop")) return ["desktop"];
    if (hasAddon(addonMap, "mobile")) return ["mobile"];
    return ["web"];
  })();

  const cfgFramework = config.framework as FrameworkName | undefined;
  const framework = (cfgFramework ??
    (hasAddon(addonMap, "tanstack-start") ? "tanstack-start" : "nextjs")) as FrameworkName;

  const isMobileOnly = effectiveApps.includes("mobile") && !effectiveApps.includes("web");
  const isDesktopOnly =
    effectiveApps.includes("desktop") &&
    !effectiveApps.includes("web") &&
    !effectiveApps.includes("mobile");

  const files = isDesktopOnly
    ? buildDesktopFiles(config.name, runtime, effectiveBilling, hasEve, hasI18n, secrets, addonMap)
    : isMobileOnly
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
  // --- GhostInit Phase A: proxy + permissions + shell for both modes ---
  const hasWebSingle = effectiveApps.includes("web");
  const isNextSingle =
    (config.framework ?? "nextjs") === "nextjs" ||
    (!config.framework && !hasAddon(addonMap, "tanstack-start"));
  if (hasWebSingle && isNextSingle) for (const f of proxyFiles(mode, hasI18n)) withoutOld.push(f);
  for (const f of accessFiles(mode)) withoutOld.push(f);
  if (hasWebSingle) for (const f of shellFiles(mode)) withoutOld.push(f);

  // Same-path emissions collapse here; differing content is a real conflict and
  // fails loudly rather than dropping one implementation. See ../../shared.ts.
  let deduped = dedupeFilesOrThrow(withoutOld);
  // Conditional stripping for frontend preset
  const hasAuth = hasAddon(addonMap, "auth");
  const hasAnalytics = hasAddon(addonMap, "analytics");
  const hasEmail = hasAddon(addonMap, "email");
  const hasApi = hasAddon(addonMap, "api");
  const hasCache = hasAddon(addonMap, "cache") || cache === "redis";
  if (!hasAuth) {
    deduped = deduped.filter(
      (f) =>
        !f.path.includes("auth") &&
        !f.content.includes('from "@repo/auth"') &&
        !f.content.includes("auth-client"),
    );
  }
  if (!hasAnalytics) {
    deduped = deduped.filter(
      (f) => !f.path.includes("analytics") && !f.content.includes('from "@repo/analytics"'),
    );
  }
  if (!hasEmail) {
    deduped = deduped.filter(
      (f) => !f.path.includes("email") && !f.content.includes('from "@repo/email"'),
    );
  }
  if (!hasApi) {
    deduped = deduped.filter((f) => !f.content.includes('from "@repo/api"'));
  }
  if (!hasCache) {
    deduped = deduped.filter((f) => !f.path.includes("cache"));
  }
  const finalFiles = deduped.sort((a, b) => a.path.localeCompare(b.path));

  return finalFiles.map((f) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}

export const singleTemplateFiles = singleFiles;
export default singleFiles;
export { buildSecrets, selectedBillingFromAddons } from "./config.js";
export { singlePackageJson, singlePackageJsonTanstack } from "./package.js";
