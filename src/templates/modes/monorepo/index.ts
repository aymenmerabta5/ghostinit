import type { ProjectConfig } from "../../../lib/config.js";
import { dedupeFilesOrThrow, type TemplateFile } from "../../shared.js";
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
  PresetName,
  CacheProvider,
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
import { cacheComposerFiles } from "./cache-composer.js";

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
    const hasDesktop = hasAddon(addonMap, "desktop");
    if (hasWeb || hasMobile || hasDesktop) {
      effectiveApps = [
        ...(hasWeb ? (["web"] as AppName[]) : []),
        ...(hasMobile ? (["mobile"] as AppName[]) : []),
        ...(hasDesktop ? (["desktop"] as AppName[]) : []),
      ] as AppName[];
    } else {
      effectiveApps = ["web"] as AppName[];
    }
  }

  const configuredDatabase = config.database as DatabaseProvider | undefined;
  const effectiveDatabase = (configuredDatabase ??
    (hasAddon(addonMap, "convex")
      ? "convex"
      : hasAddon(addonMap, "none")
        ? "none"
        : "postgres")) as DatabaseProvider;

  const hasAuth = hasAddon(addonMap, "auth");
  const hasAnalytics = hasAddon(addonMap, "analytics");
  const hasEmail = hasAddon(addonMap, "email");
  const hasApi = hasAddon(addonMap, "api");
  const hasCache = hasAddon(addonMap, "cache") || cache === "redis";

  const deploy = (config.deploy ?? "none") as string;
  const all: TemplateFile[] = [
    ...rootComposerFiles(
      config.name,
      secrets,
      ctx,
      runtime,
      effectiveBilling,
      addonMap,
      effectiveDatabase,
      effectiveFramework,
      effectiveApps,
      deploy,
    ),
    ...packagesComposerFiles(runtime, effectiveFramework, effectiveDatabase, hasAnalytics),
    ...databaseComposerFiles(config.name, runtime, addonMap, effectiveDatabase),
    ...(hasAuth ? authComposerFiles(effectiveFramework, addonMap) : []),
    ...(hasApi ? apiComposerFiles(effectiveBilling) : []),
    ...uiComposerFiles(),
    ...modulesComposerFiles(runtime, effectiveBilling.length > 0),
    ...appsComposerFiles(runtime, addonMap, effectiveFramework, effectiveApps),
    ...servicesComposerFiles(
      config.name,
      runtime,
      addonMap,
      hasEve,
      hasI18n,
      effectiveFramework,
      hasEmail,
    ),
    ...billingComposerFiles("monorepo", runtime, addonMap, effectiveBilling),
    ...(hasCache ? cacheComposerFiles(runtime) : []),
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

  // Collapses same-path emissions and FAILS if two composers disagree on the
  // content. A silent last-writer-wins here previously hid a whole duplicate
  // webhook implementation for months — see dedupeFiles in ../../shared.ts.
  const deduped = dedupeFilesOrThrow(merged);

  const hasWeb = effectiveApps.includes("web" as AppName);
  const hasMobile = effectiveApps.includes("mobile" as AppName);
  let filteredFiles = deduped;
  if (!hasWeb) filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("apps/web/"));
  if (!hasMobile) filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("apps/mobile/"));
  if (!hasAuth) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        f.path.startsWith("apps/desktop/") ||
        (!f.path.startsWith("packages/auth/") &&
          !f.path.includes("/auth") &&
          !f.path.includes("auth-client")),
    );
    // Also strip auth-related app routes that may have been emitted by apps composer
    // Keep desktop auth routes (they use stub lib/auth) even when hasAuth false
    filteredFiles = filteredFiles.filter(
      (f) =>
        f.path.startsWith("apps/desktop/") ||
        (!f.path.includes("apps/web/src/app/(auth)") &&
          !f.path.includes("apps/web/src/app/auth") &&
          !f.path.includes("sign-in") &&
          !f.path.includes("sign-up") &&
          !f.path.includes("two-factor") &&
          !f.path.includes("2fa")),
    );
  }
  if (!hasAnalytics) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.path.startsWith("packages/analytics/") &&
        !f.path.includes("/ingest") &&
        !f.path.includes("analytics"),
    );
  }
  if (!hasEmail) {
    filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("packages/email/"));
  }
  if (!hasApi) {
    filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("packages/api/"));
  }
  if (!hasCache) {
    filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("packages/cache/"));
  }
  // Content-based filtering for remaining files that import disabled packages
  // Desktop is a standalone Electron SPA that ships its own minimal orpc/auth via http://localhost:3000
  // even when host preset disables @repo/api/@repo/auth. Exempt desktop paths from host-level stripping.
  const isDesktopPath = (p: string) => p.startsWith("apps/desktop/");
  if (!hasAuth) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        isDesktopPath(f.path) ||
        (!f.content.includes('from "@repo/auth"') &&
          !f.content.includes("from '@repo/auth'") &&
          !f.content.includes('require("@repo/auth"') &&
          !f.content.includes("auth-client")),
    );
  }
  if (!hasApi) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        isDesktopPath(f.path) ||
        (!f.content.includes('from "@repo/api"') &&
          !f.content.includes("from '@repo/api'") &&
          !f.content.includes("lib/orpc")),
    );
  }
  if (!hasAnalytics) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.content.includes('from "@repo/analytics"') &&
        !f.content.includes("from '@repo/analytics'"),
    );
  }
  if (!hasEmail) {
    filteredFiles = filteredFiles.filter(
      (f) => !f.content.includes('from "@repo/email"') && !f.content.includes("from '@repo/email'"),
    );
  }

  // Strip workspace deps for disabled packages from remaining package.json files
  const disabledPackages = new Set<string>();
  if (!hasAuth) disabledPackages.add("@repo/auth");
  if (!hasApi) disabledPackages.add("@repo/api");
  if (!hasAnalytics) disabledPackages.add("@repo/analytics");
  if (!hasEmail) disabledPackages.add("@repo/email");
  if (!hasCache) disabledPackages.add("@repo/cache");
  // billing is handled separately via effectiveBilling, but if no billing selected strip all billing providers
  if (effectiveBilling.length === 0) {
    disabledPackages.add("@repo/billing");
  }
  if (disabledPackages.size > 0) {
    filteredFiles = filteredFiles.map((f) => {
      if (!f.path.endsWith("package.json")) return f;
      try {
        const pkg = JSON.parse(f.content) as Record<string, unknown>;
        let changed = false;
        for (const depKey of [
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ] as const) {
          const deps = pkg[depKey] as Record<string, string> | undefined;
          if (deps && typeof deps === "object") {
            for (const pkgName of disabledPackages) {
              if (pkgName in deps) {
                delete deps[pkgName];
                changed = true;
              }
            }
            // Also strip transitive billing provider deps if billing disabled? keep simple
          }
        }
        if (changed) {
          return { ...f, content: `${JSON.stringify(pkg, null, 2)}\n` };
        }
      } catch {}
      return f;
    });
  }

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

  return finalFiles.map((f: TemplateFile) => {
    let fileContent = f.content.replace(/__PROJECT_NAME__/g, config.name);
    let filePath = f.path.replace(/__PROJECT_NAME__/g, config.name);
    if (filePath.endsWith("app.json")) {
      try {
        const parsed = JSON.parse(fileContent) as { expo?: Record<string, unknown> };
        if (parsed.expo) {
          const sanitized = config.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
          (parsed.expo as { scheme?: string }).scheme = sanitized;
          fileContent = `${JSON.stringify(parsed, null, 2)}\n`;
        }
      } catch {}
    }
    if (filePath.endsWith("auth-client.ts") && fileContent.includes("scheme:")) {
      const sanitized = config.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
      fileContent = fileContent.replace(/scheme:\s*"[^"]*"/, `scheme: "${sanitized}"`);
    }
    // packages/auth emits "__APP_SCHEME__://" in trustedOrigins when a mobile app
    // exists; it must match the scheme written into auth-client.ts above.
    if (fileContent.includes("__APP_SCHEME__")) {
      const sanitized = config.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
      fileContent = fileContent.replace(/__APP_SCHEME__/g, sanitized);
    }
    return { path: filePath, content: fileContent };
  });
}

export const monorepoTemplateFiles = monorepoFiles;
export default monorepoFiles;
