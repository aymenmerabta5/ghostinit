// @allow-long 21-imports: monorepo/index assembles via dedup+sort+__PROJECT_NAME__ replace — intentional delegation obscures graph, acknowledged
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
import { realtimePackage } from "../../realtime.js";
import { storagePackage } from "../../storage.js";
import { messagingFilesFor } from "../../apps/fragments/messaging/index.js";
import { billingComposerFiles } from "./billing-composer.js";
import { servicesComposerFiles } from "./services-composer.js";
import { agentsComposerFiles } from "./agents-composer.js";
import { cacheComposerFiles } from "./cache-composer.js";
import { pdfComposerFiles } from "./pdf-composer.js";
import { proxyFiles } from "../../proxy.js";
import { normalizeCloudflareTemplateFiles } from "../../cloudflare-normalization.js";
import { accessFiles } from "../../access.js";
import { shellFiles } from "../../shell.js";
import { integrateAdapterFiles } from "../../adapters/integration.js";
import { integrateEveSecurityFiles } from "../../eve/security/index.js";
import { capabilityClientFiles } from "../../apps/capability-clients/index.js";

export interface MonorepoSecrets extends RootSecrets {}
export interface MonorepoContext {
  dryRun?: boolean;
}

function withoutClientAnalyticsEnvironment(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const name = line.split("=", 1)[0] ?? "";
      return (
        !/^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)POSTHOG_/.test(name) &&
        !/^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_)?ANALYTICS_DISABLED$/.test(name)
      );
    })
    .join("\n");
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
      deploy: config.deploy ?? "none",
      auth: config.auth,
      api: config.api,
      email: config.email,
      analytics: config.analytics,
      eve: config.eve,
      i18n: config.i18n,
      pdf: config.pdf,
      messaging: config.messaging,
      storage: config.storage,
      notifications: config.notifications,
      featureFlags: config.featureFlags,
      jobs: config.jobs,
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
      : hasAddon(addonMap, "database:none")
        ? "none"
        : "postgres")) as DatabaseProvider;

  const requestedAuth = hasAddon(addonMap, "auth");
  const hasFeatureFlags = hasAddon(addonMap, "featureFlags") || hasAddon(addonMap, "posthog");
  const hasNotifications = hasAddon(addonMap, "notifications");
  const hasJobs = hasAddon(addonMap, "jobs") || config.jobs === true;
  const hasMessaging = hasAddon(addonMap, "messaging") || config.messaging === true;
  const hasStorage = hasAddon(addonMap, "storage") || config.storage === true || hasMessaging;
  const hasAnalytics = hasAddon(addonMap, "analytics");
  const hasEmail = hasAddon(addonMap, "email");
  const requestedApi = hasAddon(addonMap, "api");
  const hasJobsApi = hasJobs && (config.jobsUserFacingApi ?? (requestedApi && requestedAuth));
  // V1 exposes authenticated `me`, and billing transport requires both API and
  // auth. Resolve implications before passing the map to any composer.
  const hasBilling = effectiveBilling.length > 0 || hasAddon(addonMap, "billing");
  const hasApi =
    requestedApi ||
    (hasEve && requestedAuth) ||
    hasBilling ||
    hasMessaging ||
    hasStorage ||
    hasNotifications ||
    hasFeatureFlags ||
    hasJobsApi;
  const hasAuth = requestedAuth || hasBilling || hasMessaging || hasNotifications || hasStorage;
  const compositionAddons: AddonInstallerMap = {
    ...addonMap,
    api: { inUse: hasApi },
    auth: { inUse: hasAuth },
    analytics: { inUse: hasAnalytics },
    storage: { inUse: hasStorage },
    jobsApi: { inUse: hasJobsApi && hasAuth },
  };
  const hasCache = hasAddon(addonMap, "cache") || cache === "redis";
  const hasPdf = hasAddon(addonMap, "pdf") || config.pdf === true;
  const hasWebEarly = effectiveApps.includes("web" as AppName);

  const deploy = config.deploy ?? "none";
  const all: TemplateFile[] = [
    ...rootComposerFiles(
      config.name,
      secrets,
      ctx,
      runtime,
      effectiveBilling,
      compositionAddons,
      effectiveDatabase,
      effectiveFramework,
      effectiveApps,
      deploy,
      hasEmail,
    ),
    ...packagesComposerFiles(
      runtime,
      effectiveFramework,
      effectiveDatabase,
      hasAnalytics,
      hasEmail,
      effectiveApps,
      hasNotifications,
      hasCache,
      hasEve,
      deploy,
    ),
    ...databaseComposerFiles(config.name, runtime, compositionAddons, effectiveDatabase),
    ...(hasAuth ? authComposerFiles(effectiveFramework, compositionAddons, hasEmail) : []),
    ...(hasApi
      ? apiComposerFiles(effectiveBilling, hasMessaging, effectiveDatabase, {
          auth: hasAuth,
          identity: hasAuth && effectiveDatabase !== "none",
          notifications: hasNotifications,
          featureFlags: hasFeatureFlags,
          jobs: hasJobsApi && hasAuth,
          storage: hasStorage && hasAuth,
        })
      : []),
    ...uiComposerFiles(effectiveApps, effectiveFramework),
    ...modulesComposerFiles(
      runtime,
      effectiveBilling.length > 0,
      hasMessaging && effectiveDatabase === "postgres",
    ),
    ...appsComposerFiles(runtime, compositionAddons, effectiveFramework, effectiveApps, hasEmail),
    ...capabilityClientFiles({
      mode,
      framework: effectiveFramework,
      apps: effectiveApps,
      notifications: hasNotifications,
      storage: hasStorage,
      featureFlags: hasFeatureFlags,
      jobs: hasJobsApi,
      i18n: hasI18n,
      requestApplication: hasAuth && effectiveDatabase !== "none",
    }),
    ...servicesComposerFiles(
      config.name,
      runtime,
      compositionAddons,
      hasEve,
      hasI18n,
      effectiveFramework,
      hasEmail,
      effectiveBilling,
    ),
    ...billingComposerFiles("monorepo", runtime, compositionAddons, effectiveBilling),
    ...(hasCache ? cacheComposerFiles(runtime) : []),
    ...(hasPdf
      ? pdfComposerFiles(
          "monorepo",
          effectiveApps.includes("mobile"),
          effectiveApps.includes("desktop"),
          effectiveFramework,
          effectiveApps.includes("web"),
          hasI18n,
        )
      : []),
    ...(hasMessaging && effectiveDatabase === "postgres" ? realtimePackage() : []),
    ...(hasStorage && effectiveDatabase === "postgres" ? storagePackage() : []),
    ...(hasMessaging
      ? messagingFilesFor(effectiveFramework, effectiveDatabase, effectiveApps, "monorepo", hasI18n)
      : []),
    ...(hasWebEarly && effectiveFramework === "nextjs"
      ? proxyFiles(mode, hasI18n, hasAuth, config.deploy ?? "none", effectiveBilling)
      : []),
    ...accessFiles(mode),
    ...(hasWebEarly && effectiveFramework === "nextjs" ? shellFiles(mode, hasBilling) : []),
  ];

  const integrated = integrateAdapterFiles(all, {
    mode,
    database: effectiveDatabase,
    runtime,
    capabilities: {
      identity: hasAuth && hasApi,
      notifications: hasNotifications,
      featureFlags: hasFeatureFlags,
      jobs: hasJobs,
      jobsApi: hasJobsApi && hasAuth,
      storage: hasStorage,
      messaging: hasMessaging,
    },
  });

  const enrichedAgents = agentsComposerFiles(
    config.name,
    effectiveBilling,
    hasEve,
    hasI18n,
    effectiveFramework,
    hasEmail,
    {
      runtime,
      database: effectiveDatabase,
      apps: effectiveApps,
      auth: hasAuth,
      api: hasApi,
      analytics: hasAnalytics,
      messaging: hasMessaging,
      storage: hasStorage,
      notifications: hasNotifications,
      featureFlags: hasFeatureFlags,
      jobs: hasJobs,
      jobsApi: hasJobsApi && hasAuth,
      pdf: hasPdf,
      cache: hasCache,
      deploy: config.deploy ?? "none",
    },
  );
  const withoutOldAgents = integrated.filter(
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
        !f.path.startsWith("packages/auth/") &&
        !f.path.includes("/auth") &&
        !f.path.includes("auth-client"),
    );
    // Also strip auth-related app routes that may have been emitted by app composers.
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.path.includes("apps/web/src/app/(auth)") &&
        !f.path.includes("apps/web/src/app/auth") &&
        !f.path.includes("sign-in") &&
        !f.path.includes("sign-up") &&
        !f.path.includes("two-factor") &&
        !f.path.includes("2fa"),
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
  if (!hasApi) {
    filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("packages/api/"));
  }
  if (!hasCache) {
    filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("packages/cache/"));
  }
  if (!hasPdf) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.path.startsWith("packages/pdf/") &&
        !f.path.includes("/pdf") &&
        !f.path.includes("usePdf"),
    );
  }
  // Content-based filtering for remaining files that import disabled packages.
  // Desktop templates are capability-aware too; they must not bypass package closure.
  if (!hasAuth) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.content.includes('from "@repo/auth"') &&
        !f.content.includes("from '@repo/auth'") &&
        !f.content.includes('require("@repo/auth"') &&
        !f.content.includes("auth-client"),
    );
  }
  if (!hasApi) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.content.includes('from "@repo/api"') &&
        !f.content.includes("from '@repo/api'") &&
        !f.content.includes("lib/orpc"),
    );
  }
  if (!hasAnalytics) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.content.includes('from "@repo/analytics"') &&
        !f.content.includes("from '@repo/analytics'"),
    );
  }
  if (!hasPdf) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.content.includes('from "@repo/pdf"') &&
        !f.content.includes("from '@repo/pdf'") &&
        !f.content.includes("@react-pdf/renderer") &&
        !f.content.includes("qrcode") &&
        !f.content.includes("dejavu"),
    );
  }
  if (!hasMessaging) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.path.includes("messaging") &&
        !f.path.includes("realtime") &&
        !f.path.includes("/ws") &&
        !f.content.includes('from "@repo/realtime"') &&
        !f.content.includes("@orpc/server/ws") &&
        !f.content.includes("@orpc/server/crossws") &&
        !f.content.includes("@orpc/client/websocket"),
    );
  } else if (effectiveDatabase === "convex") {
    // Convex messaging does not use WS realtime/storage
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.path.includes("packages/realtime") &&
        !f.path.includes("packages/storage") &&
        !f.path.includes("/api/ws") &&
        f.path !== "apps/web/server.ts",
    );
  } else if (effectiveDatabase === "postgres") {
    // Postgres messaging does not use convex/messaging.ts
    filteredFiles = filteredFiles.filter((f) => !f.path.includes("convex/messaging.ts"));
  }
  if (!hasStorage) {
    filteredFiles = filteredFiles.filter(
      (f) =>
        !f.path.includes("storage") &&
        !f.content.includes('from "@repo/storage"') &&
        !f.content.includes("from '@repo/storage'"),
    );
  } else if (effectiveDatabase === "convex") {
    filteredFiles = filteredFiles.filter((f) => !f.path.startsWith("packages/storage/"));
  }

  // Strip workspace deps for disabled packages from remaining package.json files
  const disabledPackages = new Set<string>();
  if (!hasAuth) disabledPackages.add("@repo/auth");
  if (!hasApi) disabledPackages.add("@repo/api");
  if (!hasAnalytics) disabledPackages.add("@repo/analytics");
  if (!hasCache) disabledPackages.add("@repo/cache");
  if (!hasPdf) disabledPackages.add("@repo/pdf");
  if (!hasMessaging || effectiveDatabase === "convex") {
    disabledPackages.add("@repo/realtime");
  }
  if (!hasStorage || effectiveDatabase === "convex") {
    disabledPackages.add("@repo/storage");
  }
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
  if (!hasAnalytics) {
    filteredFiles = filteredFiles.map((entry) =>
      entry.path === ".env.example" ||
      entry.path === ".env.local" ||
      entry.path === "apps/web/.env.local"
        ? { ...entry, content: withoutClientAnalyticsEnvironment(entry.content) }
        : entry,
    );
  }

  filteredFiles = integrateEveSecurityFiles(filteredFiles, {
    auth: hasAuth,
    database: effectiveDatabase,
    eve: hasEve,
    framework: effectiveFramework,
    mode,
    web: hasWeb,
  });

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

  const deployNormalized =
    config.deploy === "cloudflare"
      ? normalizeCloudflareTemplateFiles(filteredFiles, effectiveFramework, mode)
      : filteredFiles;
  const finalFiles = deployNormalized.sort((a: TemplateFile, b: TemplateFile) =>
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
