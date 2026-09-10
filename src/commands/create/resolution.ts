import { projectConfigSchema, type ProjectConfig } from "../../lib/config.js";
import type { DesiredProjectConfig, ResolvedProjectConfig } from "../../domain/project/config.js";
import { resolveProjectConfig } from "../../domain/project/resolve.js";
import { projectConfigToDesired } from "../../lib/project-config.js";
import {
  isValidAddonCombo,
  type AppName,
  type BillingProviderName,
  type CacheProvider,
  type DatabaseProvider,
  type DeployTarget,
  type FeatureName,
  type FrameworkName,
  type FeatureFlagProvider,
  type PresetName,
  type ProjectMode,
} from "../../lib/addons.js";

export interface CreateResolutionInput {
  readonly name: string;
  readonly runtime: "node" | "bun";
  readonly mode: ProjectMode;
  readonly framework: FrameworkName;
  readonly billing: BillingProviderName[];
  readonly features: FeatureName[];
  readonly database: DatabaseProvider;
  readonly databaseWasExplicit: boolean;
  readonly apps: AppName[];
  readonly preset: PresetName | undefined;
  readonly cache: CacheProvider;
  readonly deploy: DeployTarget;
  readonly withAuth?: boolean;
  readonly withApi?: boolean;
  readonly withEmail?: boolean;
  readonly withAnalytics?: boolean;
  readonly withEve?: boolean;
  readonly withI18n?: boolean;
  readonly withPdf?: boolean;
  readonly withMessaging?: boolean;
  readonly withStorage?: boolean;
  readonly withNotifications?: boolean;
  readonly featureFlags?: FeatureFlagProvider;
  readonly withJobs?: boolean;
}

export const CREATE_RESOLUTION_FAILURE_REASONS = [
  "addon-combination-invalid",
  "single-native-server-capabilities-unsupported",
  "server-capable-web-app-required",
  "capability-deploy-binding-unsupported",
  "database-deploy-binding-unsupported",
  "project-capability-resolution-failed",
] as const;

export type CreateResolutionFailureReason = (typeof CREATE_RESOLUTION_FAILURE_REASONS)[number];

export type CreateResolution =
  | {
      readonly ok: true;
      readonly config: ProjectConfig;
      readonly desiredConfig: DesiredProjectConfig;
      readonly resolvedConfig: ResolvedProjectConfig;
    }
  | {
      readonly ok: false;
      readonly reason: CreateResolutionFailureReason;
      readonly message: string;
      readonly unsupportedSelections?: readonly string[];
    };

/** Resolve the complete project config identically for `create` and `init`. */
export function resolveCreateConfig(input: CreateResolutionInput): CreateResolution {
  const preset = input.preset ?? "saas";
  const database =
    (preset === "frontend" || preset === "custom") && !input.databaseWasExplicit
      ? "none"
      : input.database;

  let auth = preset === "saas";
  let api = preset === "saas";
  let email = preset === "saas";
  let analytics = preset === "saas";
  let eve = input.features.includes("eve");
  let i18n = input.features.includes("i18n");
  let pdf = false;
  let messaging = false;
  let storage = false;
  let notifications = false;
  const featureFlags = input.featureFlags ?? "none";
  let jobs = false;

  if (preset === "custom") {
    auth = input.withAuth === true;
    api = input.withApi === true;
    email = input.withEmail === true;
    analytics = input.withAnalytics === true;
    eve = eve || input.withEve === true;
    i18n = i18n || input.withI18n === true;
    pdf = input.withPdf === true;
    messaging = input.withMessaging === true;
    storage = input.withStorage === true;
    notifications = input.withNotifications === true;
    jobs = input.withJobs === true;
  } else {
    if (input.withAuth === true) auth = true;
    if (input.withApi === true) api = true;
    if (input.withEmail === true) email = true;
    if (input.withAnalytics === true) analytics = true;
    if (input.withEve === true) eve = true;
    if (input.withI18n === true) i18n = true;
    if (input.withPdf === true) pdf = true;
    if (input.withMessaging === true) messaging = true;
    if (input.withStorage === true) storage = true;
    if (input.withNotifications === true) notifications = true;
    if (input.withJobs === true) jobs = true;
  }
  storage = storage || messaging || input.billing.includes("manual");
  if (storage || notifications || jobs) {
    auth = true;
    api = true;
  }
  if (eve || pdf) {
    auth = true;
    api = true;
  }
  if (featureFlags === "posthog") api = true;

  const singleNativeApp =
    input.mode === "single" && input.apps.length === 1
      ? input.apps.find((app) => app === "mobile" || app === "desktop")
      : undefined;
  const unsupportedNativeSelections = [
    database !== "none" ? `database:${database}` : undefined,
    auth ? "auth" : undefined,
    api ? "api" : undefined,
    email ? "email" : undefined,
    input.billing.length > 0 ? `billing:${[...input.billing].sort().join(",")}` : undefined,
    messaging ? "messaging" : undefined,
    storage ? "storage" : undefined,
    input.cache !== "none" ? `cache:${input.cache}` : undefined,
    pdf ? "pdf" : undefined,
    eve ? "eve" : undefined,
    notifications ? "notifications" : undefined,
    featureFlags !== "none" ? `feature-flags:${featureFlags}` : undefined,
    jobs ? "jobs" : undefined,
    input.deploy !== "none" ? `deploy:${input.deploy}` : undefined,
  ].filter((selection): selection is string => selection !== undefined);
  if (singleNativeApp !== undefined && unsupportedNativeSelections.length > 0) {
    return {
      ok: false,
      reason: "single-native-server-capabilities-unsupported",
      unsupportedSelections: unsupportedNativeSelections,
      message: `Single-mode ${singleNativeApp} is a frontend-only client target; GhostInit does not generate or select a backend host for it. Unsupported server-backed selections: ${unsupportedNativeSelections.join(", ")}. External remote-backend host selection is not implemented. Use --preset frontend with optional analytics/i18n, or use --mode monorepo --apps web,${singleNativeApp} for generated backend capabilities`,
    };
  }

  const combo = isValidAddonCombo({
    billing: input.billing,
    database,
    mode: input.mode,
    framework: input.framework,
    apps: input.apps,
    preset,
    cache: input.cache,
    hasAuth: auth,
    hasApi: api,
    hasMessaging: messaging,
    hasStorage: storage,
    hasNotifications: notifications,
    featureFlags,
    hasJobs: jobs,
  });
  if (!combo.valid) {
    return {
      ok: false,
      reason: "addon-combination-invalid",
      message: combo.message ?? "Incompatible addon combination",
    };
  }

  if (input.databaseWasExplicit && database !== "none" && !input.apps.includes("web")) {
    return {
      ok: false,
      reason: "server-capable-web-app-required",
      message: `Database ${database} requires a server-capable web app`,
    };
  }

  if ((email || pdf) && !input.apps.includes("web")) {
    return {
      ok: false,
      reason: "server-capable-web-app-required",
      message:
        "Email and PDF capabilities require a server-capable web app. Add --apps web or disable them",
    };
  }
  if (input.deploy !== "none" && !input.apps.includes("web")) {
    return {
      ok: false,
      reason: "server-capable-web-app-required",
      message: `Deploy target ${input.deploy} requires a server-capable web app`,
    };
  }
  if (eve && (!api || !input.apps.includes("web"))) {
    return {
      ok: false,
      reason: "server-capable-web-app-required",
      message: "Eve requires --with-api and a server-capable web app",
    };
  }

  const config = projectConfigSchema.parse({
    name: input.name,
    runtime: input.runtime,
    version: "0.1.0",
    mode: input.mode,
    framework: input.framework,
    billing: input.billing,
    features: input.features.filter((feature) => feature !== "eve" && feature !== "i18n"),
    database,
    apps: input.apps,
    preset,
    cache: input.cache,
    deploy: input.deploy,
    auth,
    api,
    email,
    analytics,
    eve,
    i18n,
    pdf,
    messaging,
    storage,
    notifications,
    featureFlags,
    jobs,
    jobsUserFacingApi: jobs,
  });
  const desiredConfig = projectConfigToDesired(config);
  const resolved = resolveProjectConfig(desiredConfig);
  if (!resolved.ok) {
    const hasUnsupportedCapabilityDeployBinding = resolved.issues.some(
      (issue) => issue.code === "capability-deploy-binding-unsupported",
    );
    const hasUnsupportedDatabaseDeployBinding = resolved.issues.some(
      (issue) => issue.code === "database-deploy-binding-unsupported",
    );
    return {
      ok: false,
      reason: hasUnsupportedDatabaseDeployBinding
        ? "database-deploy-binding-unsupported"
        : hasUnsupportedCapabilityDeployBinding
          ? "capability-deploy-binding-unsupported"
          : "project-capability-resolution-failed",
      message: resolved.issues.map((issue) => issue.message).join(" "),
    };
  }
  return { ok: true, config, desiredConfig, resolvedConfig: resolved.config };
}
