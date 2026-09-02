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
import { pdfFilesWithApps } from "../../pdf/index.js";
import { messagingFilesFor } from "../../apps/fragments/messaging/index.js";
import { realtimePackage } from "../../realtime.js";
import { storagePackage } from "../../storage.js";
import { singlePostgresMessagingFiles } from "../../messaging/postgres-single.js";
import { convexMessagingDatabaseFiles } from "../../messaging/convex.js";
import { lintScriptFiles } from "../../tooling/lint-scripts.js";
import {
  dependencyAuditFiles,
  integrateDependencyAuditManifest,
} from "../../tooling/dependency-audit.js";
import { deployFiles } from "../../root/deploy.js";
import { bunfig } from "../../root/package.js";
import { integrateAdapterFiles } from "../../adapters/integration.js";
import { integrateEveSecurityFiles } from "../../eve/security/index.js";
import { capabilityClientFiles } from "../../apps/capability-clients/index.js";
import { singleWebSmokeTest } from "../../apps/tests.js";
import {
  designSystemFiles,
  integrateDesignSystemApplications,
  resolveDesignSystemApps,
} from "../../ui.js";
import * as v from "../../versions.js";
import { singleCacheFiles } from "./cache.js";

export interface SingleContext {
  dryRun?: boolean;
}

type Runtime = "node" | "bun";

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

function injectConvexMessagingSchema(files: TemplateFile[]): void {
  const index = files.findIndex((templateFile) => templateFile.path === "convex/schema.ts");
  if (index === -1 || files[index].content.includes("  conversations: defineTable({")) return;
  const tables = `  conversations: defineTable({
    createdBy: v.id("users"),
    directKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_createdBy", ["createdBy"]).index("by_directKey", ["directKey"]),

  conversationParticipants: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    joinedAt: v.number(),
    lastReadAt: v.optional(v.number()),
  }).index("by_conversationId", ["conversationId"]).index("by_userId", ["userId"]).index("by_conversation_user", ["conversationId", "userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    body: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("messageAttachments"))),
    replyToId: v.optional(v.id("messages")),
    createdAt: v.number(),
  }).index("by_conversation_created", ["conversationId", "createdAt"]),

  messageAttachments: defineTable({
    conversationId: v.id("conversations"),
    ownerId: v.id("users"),
    messageId: v.optional(v.id("messages")),
    mimeType: v.string(),
    byteSize: v.number(),
    originalName: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_messageId", ["messageId"]).index("by_owner", ["ownerId"]).index("by_pending_owner", ["ownerId", "conversationId", "expiresAt"]),

  attachmentUploadIntents: defineTable({
    conversationId: v.id("conversations"),
    ownerId: v.id("users"),
    expectedByteSize: v.number(),
    status: v.union(v.literal("pending"), v.literal("committed")),
    expiresAt: v.number(),
    storageId: v.optional(v.id("_storage")),
  }).index("by_owner", ["ownerId"]).index("by_owner_status", ["ownerId", "status"]).index("by_owner_expiry", ["ownerId", "expiresAt"]).index("by_expiry", ["expiresAt"]).index("by_storageId", ["storageId"]),

  attachmentStorage: defineTable({
    attachmentId: v.id("messageAttachments"),
    storageId: v.id("_storage"),
  }).index("by_attachmentId", ["attachmentId"]).index("by_storageId", ["storageId"]),

  typingIndicators: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    isTyping: v.boolean(),
    updatedAt: v.number(),
  }).index("by_conversation", ["conversationId"]).index("by_conversation_user", ["conversationId", "userId"]),

`;
  const content = files[index].content;
  const closing = content.lastIndexOf("});");
  if (closing === -1) throw new Error("Convex schema is missing its defineSchema terminator");
  files[index] = {
    ...files[index],
    content: `${content.slice(0, closing)}${tables}${content.slice(closing)}`,
  };
}

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
  const hasEmail = hasAddon(addonMap, "email");
  const requestedAuth = hasAddon(addonMap, "auth");
  const requestedApi = hasAddon(addonMap, "api");
  const hasFeatureFlags = hasAddon(addonMap, "featureFlags") || hasAddon(addonMap, "posthog");
  const hasNotifications = hasAddon(addonMap, "notifications");
  const hasJobsEarly = hasAddon(addonMap, "jobs") || config.jobs === true;
  const hasJobsApi = hasJobsEarly && (config.jobsUserFacingApi ?? (requestedApi && requestedAuth));
  const hasMessagingEarly = hasAddon(addonMap, "messaging") || config.messaging === true;
  const hasStorageEarly =
    hasAddon(addonMap, "storage") || config.storage === true || hasMessagingEarly;
  const hasAnalytics = hasAddon(addonMap, "analytics");
  const hasCache = hasAddon(addonMap, "cache") || cache === "redis";
  const selectedBilling = selectedBillingFromAddons(addonMap);
  const effectiveBilling: BillingProviderName[] =
    selectedBilling.length > 0
      ? selectedBilling
      : ((config.billing ?? []) as BillingProviderName[]);
  // V1 contracts include authenticated `me`, and every billing route is both
  // API-backed and authenticated. Resolve those implications once, before any
  // manifest or file composer runs.
  const hasBilling = effectiveBilling.length > 0 || hasAddon(addonMap, "billing");
  const effectiveApi =
    requestedApi ||
    (hasEve && requestedAuth) ||
    hasBilling ||
    hasMessagingEarly ||
    hasStorageEarly ||
    hasNotifications ||
    hasFeatureFlags ||
    hasJobsApi;
  const effectiveAuth =
    requestedAuth || hasBilling || hasMessagingEarly || hasNotifications || hasStorageEarly;
  const compositionAddons: AddonInstallerMap = {
    ...addonMap,
    api: { inUse: effectiveApi },
    auth: { inUse: effectiveAuth },
    analytics: { inUse: hasAnalytics },
    storage: { inUse: hasStorageEarly },
    jobsApi: { inUse: hasJobsApi },
  };

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
  const resolvedDesignSystemApps = resolveDesignSystemApps(
    [
      (effectiveApps.includes("web")
        ? "web"
        : effectiveApps.includes("mobile")
          ? "mobile"
          : "desktop") as AppName,
    ],
    framework,
  );

  const files = isDesktopOnly
    ? buildDesktopFiles(
        config.name,
        runtime,
        effectiveBilling,
        hasEve,
        hasI18n,
        secrets,
        compositionAddons,
      )
    : isMobileOnly
      ? buildExpoFiles(
          config.name,
          runtime,
          effectiveBilling,
          hasEve,
          hasI18n,
          secrets,
          compositionAddons,
        )
      : framework === "tanstack-start"
        ? buildTanstackFiles(
            config.name,
            runtime,
            effectiveBilling,
            hasEve,
            hasI18n,
            hasEmail,
            effectiveApi,
            hasAnalytics,
            secrets,
            compositionAddons,
          )
        : buildNextFiles(
            config.name,
            runtime,
            effectiveBilling,
            hasEve,
            hasI18n,
            hasEmail,
            effectiveApi,
            hasAnalytics,
            secrets,
            compositionAddons,
          );

  const effectiveDatabaseSingle = (config.database ?? "postgres") as DatabaseProvider;
  const enrichedAgents = updatedAgentsMd(
    config.name,
    effectiveBilling,
    hasEve,
    hasI18n,
    hasEmail,
    framework,
    {
      runtime,
      database: effectiveDatabaseSingle,
      apps: effectiveApps as AppName[],
      auth: effectiveAuth,
      api: effectiveApi,
      analytics: hasAnalytics,
      messaging: hasMessagingEarly,
      storage: hasStorageEarly,
      notifications: hasNotifications,
      featureFlags: hasFeatureFlags,
      jobs: hasJobsEarly,
      jobsApi: hasJobsApi && effectiveAuth,
      pdf: hasAddon(addonMap, "pdf") || config.pdf === true,
    },
  );
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
    bunfig(),
  );
  withoutOld.push(...designSystemFiles("single", resolvedDesignSystemApps));
  withoutOld.push(
    ...capabilityClientFiles({
      mode,
      framework,
      apps: effectiveApps as AppName[],
      notifications: hasNotifications,
      storage: hasStorageEarly,
      featureFlags: hasFeatureFlags,
      jobs: hasJobsApi,
      i18n: hasI18n,
      requestApplication: effectiveAuth && effectiveDatabaseSingle !== "none",
    }),
  );
  if (hasCache) {
    withoutOld.push(...singleCacheFiles());
    const packageFile = withoutOld.find((entry) => entry.path === "package.json");
    if (!packageFile) throw new Error("Single-mode cache requires a root package.json");
    const manifest = JSON.parse(packageFile.content) as {
      dependencies?: Record<string, string>;
    };
    manifest.dependencies = {
      ...manifest.dependencies,
      "@upstash/redis": `^${v.cache["@upstash/redis"]}`,
    };
    packageFile.content = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  // --- GhostInit Phase A: proxy + permissions + shell for both modes ---
  const hasWebSingle = effectiveApps.includes("web");
  const hasPdfEarly = hasAddon(addonMap, "pdf") || config.pdf === true;
  if (hasWebSingle) withoutOld.push(singleWebSmokeTest());
  const isNextSingle =
    (config.framework ?? "nextjs") === "nextjs" ||
    (!config.framework && !hasAddon(addonMap, "tanstack-start"));
  if (hasWebSingle && isNextSingle)
    for (const f of proxyFiles(mode, hasI18n, effectiveAuth)) withoutOld.push(f);
  for (const f of accessFiles(mode)) withoutOld.push(f);
  if (hasWebSingle && isNextSingle)
    for (const f of shellFiles(mode, effectiveBilling.length > 0)) withoutOld.push(f);
  // Deploy config (Dockerfile / fly.toml / vercel.json) — same emitter as monorepo
  for (const f of deployFiles(config.name, config.deploy ?? "none", runtime, {
    mode: "single",
    database: effectiveDatabaseSingle,
    framework,
    apps: effectiveApps as AppName[],
    messaging: hasMessagingEarly && hasWebSingle,
    jobs: hasJobsEarly && hasWebSingle,
    storage: hasStorageEarly && hasWebSingle,
    api: effectiveApi && hasWebSingle,
    pdf: hasPdfEarly && hasWebSingle,
    eve: hasEve && hasWebSingle,
  }))
    withoutOld.push(f);
  // pdf: inject server pdf package + route + mobile/desktop helpers when opted in
  if (hasPdfEarly) {
    const isMobileSingle = effectiveApps.includes("mobile");
    const isDesktopSingle = effectiveApps.includes("desktop");
    const isWebSingle = effectiveApps.includes("web");
    const frameworkStr = (framework ?? "nextjs") as string;
    for (const f of pdfFilesWithApps(
      "single",
      isMobileSingle,
      isDesktopSingle,
      frameworkStr,
      isWebSingle,
      hasI18n,
    ))
      withoutOld.push(f);
  }
  // messaging: inject realtime + storage + UI when opted in
  if (hasMessagingEarly && effectiveDatabaseSingle === "postgres") {
    for (const f of realtimePackage("single")) withoutOld.push(f);
    for (const f of singlePostgresMessagingFiles()) withoutOld.push(f);
    const databaseIndex = withoutOld.find((f) => f.path === "src/server/db/index.ts");
    if (databaseIndex && !databaseIndex.content.includes("messagingSchema")) {
      let content = databaseIndex.content.replace(
        "import { Pool, type PoolConfig } from 'pg';",
        "import { Pool, type PoolConfig } from 'pg';\nimport * as messagingSchema from './schema/messaging';",
      );
      content = content.includes("schema: {")
        ? content.replace(
            /schema: \{ ([^}]*) \}/,
            (_match, schemas: string) => `schema: { ${schemas}, ...messagingSchema }`,
          )
        : content.replace("drizzle(pool);", "drizzle(pool, { schema: { ...messagingSchema } });");
      databaseIndex.content = content;
    }
  } else if (hasMessagingEarly && effectiveDatabaseSingle === "convex") {
    injectConvexMessagingSchema(withoutOld);
    for (const templateFile of convexMessagingDatabaseFiles()) withoutOld.push(templateFile);
  }
  if (hasMessagingEarly) {
    const frameworkStr = (framework ?? "nextjs") as string;
    const effectiveAppsSingle = effectiveApps as string[];
    // For single, map apps/web/src/... to src/... if web-only single
    const singleFiles = messagingFilesFor(
      frameworkStr,
      effectiveDatabaseSingle,
      effectiveAppsSingle,
      "single",
      hasI18n,
    )
      .map((f) => {
        if (
          f.path.startsWith("apps/web/") &&
          effectiveAppsSingle.length === 1 &&
          effectiveAppsSingle[0] === "web"
        ) {
          return { ...f, path: f.path.replace(/^apps\/web\//, "") };
        }
        if (f.path.startsWith("apps/")) {
          // single with multiple apps not supported for messaging yet — filter out
          return null as unknown as typeof f;
        }
        return f;
      })
      .filter(Boolean) as typeof withoutOld;
    for (const f of singleFiles) {
      if (!f.path.startsWith("packages/")) withoutOld.push(f);
    }
  }

  if (hasStorageEarly && effectiveDatabaseSingle === "postgres") {
    for (const f of storagePackage("single")) withoutOld.push(f);
  }

  const adapterIntegrated = integrateAdapterFiles(withoutOld, {
    mode,
    database: effectiveDatabaseSingle,
    runtime,
    capabilities: {
      identity: hasWebSingle && effectiveAuth && effectiveApi,
      notifications: hasWebSingle && hasNotifications,
      featureFlags: hasWebSingle && hasFeatureFlags,
      jobs: hasWebSingle && hasJobsEarly,
      jobsApi: hasWebSingle && hasJobsApi && effectiveAuth,
      storage: hasWebSingle && hasStorageEarly,
      messaging: hasWebSingle && hasMessagingEarly,
    },
  });

  for (const f of lintScriptFiles()) adapterIntegrated.push(f);
  // Same-path emissions collapse here; differing content is a real conflict and
  // fails loudly rather than dropping one implementation. See ../../shared.ts.
  let deduped = dedupeFilesOrThrow(adapterIntegrated);
  deduped = integrateDesignSystemApplications(deduped, "single", resolvedDesignSystemApps);
  // Conditional stripping for frontend preset
  const hasAuth = effectiveAuth;
  const hasPdf = hasAddon(addonMap, "pdf") || config.pdf === true;
  if (!hasAuth) {
    deduped = deduped.map((f) =>
      f.path === "src/server/db/index.ts"
        ? {
            ...f,
            content: f.content
              .replace(/^import \* as authSchema from ['"]\.\/schema\/auth['"];\r?\n/m, "")
              .replace(/\.\.\.authSchema,\s*/g, "")
              .replace(/,\s*\.\.\.authSchema/g, "")
              .replace(/\.\.\.authSchema/g, ""),
          }
        : f,
    );
    deduped = deduped.filter(
      (f) =>
        !f.path.includes("auth") &&
        !f.content.includes('from "@repo/auth"') &&
        !f.content.includes("auth-client"),
    );
    if (effectiveDatabaseSingle === "convex") {
      const authBoundConvexFiles = new Set(["convex/posts.ts", "convex/users.ts"]);
      deduped = deduped.filter((f) => !authBoundConvexFiles.has(f.path));
    }
  }
  if (!hasCache) {
    deduped = deduped.filter((f) => !f.path.includes("cache"));
  }
  // pdf stripping — hide package and route when off
  if (!hasPdf) {
    deduped = deduped.filter(
      (f) =>
        !f.path.includes("/pdf") &&
        !f.path.includes("usePdf") &&
        !f.content.includes("@react-pdf/renderer") &&
        !f.content.includes("qrcode"),
    );
  } else {
    // inject pdf deps into root package.json for single mode
    deduped = deduped.map((f) => {
      if (f.path !== "package.json") return f;
      try {
        const pkg = JSON.parse(f.content) as Record<string, unknown>;
        const deps = (pkg.dependencies ?? {}) as Record<string, string>;
        deps["@react-pdf/renderer"] = `^${v.pdf["@react-pdf/renderer"]}`;
        deps["dejavu-fonts-ttf"] = `^${v.pdf["dejavu-fonts-ttf"]}`;
        deps.pdfkit = `^${v.pdf.pdfkit}`;
        deps["qrcode"] = `^${v.pdf.qrcode}`;
        if (effectiveApps.includes("mobile")) {
          deps["expo-file-system"] = `~${v.expo["expo-file-system"]}`;
          deps["expo-sharing"] = `~${v.expo["expo-sharing"]}`;
        }
        pkg.dependencies = deps;
        const overrides = (pkg.overrides ?? {}) as Record<string, string>;
        overrides.pdfkit = v.pdf.pdfkit;
        pkg.overrides = overrides;
        // ensure types available
        const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
        if (!devDeps["@types/qrcode"]) devDeps["@types/qrcode"] = `^${v.pdf["@types/qrcode"]}`;
        pkg.devDependencies = devDeps;
        return { ...f, content: `${JSON.stringify(pkg, null, 2)}\n` };
      } catch {
        return f;
      }
    });
  }
  if (!hasAnalytics) {
    deduped = deduped.map((entry) =>
      entry.path === ".env.example" || entry.path === ".env.local"
        ? { ...entry, content: withoutClientAnalyticsEnvironment(entry.content) }
        : entry,
    );
  }
  deduped = integrateEveSecurityFiles(deduped, {
    auth: hasAuth,
    database: effectiveDatabaseSingle,
    eve: hasEve,
    framework,
    mode,
    web: hasWebSingle,
  });
  const hasImageSizePatch = effectiveApps.includes("mobile");
  const packageIndex = deduped.findIndex((entry) => entry.path === "package.json");
  if (packageIndex === -1) throw new Error("Single mode did not emit a root package.json");
  deduped[packageIndex] = integrateDependencyAuditManifest(
    deduped[packageIndex],
    hasImageSizePatch,
  );
  deduped = dedupeFilesOrThrow([...deduped, ...dependencyAuditFiles(hasImageSizePatch)]);
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
