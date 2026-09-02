import { join } from "node:path";
import { existsSync } from "node:fs";
import { ExitCode, ConflictError, exitCodeName } from "../../lib/errors.js";
import { envelope, printJson } from "../../lib/json.js";
import type { GlobalOptions } from "../types.js";
import { validateProjectName } from "./validation.js";
import { getIsInteractive, promptInteractive } from "./prompts.js";
import { runProjectInstall } from "./installer.js";
import { resolveCreateConfig } from "./resolution.js";
import { publicGenerationPlan } from "../../templates/default.js";
import type {
  ProjectMode,
  FrameworkName,
  DatabaseProvider,
  BillingProviderName,
  FeatureName,
  AppName,
  PresetName,
  CacheProvider,
} from "../../lib/addons.js";

export async function createCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = options.dryRun ? null : Date.now();
  const durationMs = () => (start === null ? 0 : Date.now() - start);
  let name = args[0];

  let mode: ProjectMode = (options.mode ?? "monorepo") as ProjectMode;
  let framework: FrameworkName = (options.framework ?? "nextjs") as FrameworkName;
  let billing: BillingProviderName[] = (options.billing ?? []) as BillingProviderName[];
  let features: FeatureName[] = (options.features ?? []) as FeatureName[];
  let database: DatabaseProvider = (options.database ?? "postgres") as DatabaseProvider;
  let apps: AppName[] = (options.apps ?? ["web"]) as AppName[];
  let preset: PresetName | undefined = options.preset as PresetName | undefined;
  let cache: CacheProvider = (options.cache ?? "none") as CacheProvider;
  let deploy = (options.deploy ?? "none") as import("../../lib/addons.js").DeployTarget;
  let noInstall = options.noInstall;
  let databaseWasExplicit = Array.isArray(options.rawDatabase)
    ? options.rawDatabase.length > 0
    : !!options.rawDatabase;
  // Interactive custom decoded flags lifted to outer scope
  let interactiveCustomAuth: boolean | undefined;
  let interactiveCustomApi: boolean | undefined;
  let interactiveCustomEmail: boolean | undefined;
  let interactiveCustomAnalytics: boolean | undefined;
  let interactiveCustomEve: boolean | undefined;
  let interactiveCustomI18n: boolean | undefined;
  let interactiveCustomPdf: boolean | undefined;
  let interactiveCustomMessaging: boolean | undefined;
  let interactiveCustomStorage: boolean | undefined;
  let interactiveCustomNotifications: boolean | undefined;
  let interactiveCustomFeatureFlags: boolean | undefined;
  let interactiveCustomJobs: boolean | undefined;

  const interactive = options.dryRun ? false : getIsInteractive(options);

  if (interactive) {
    const prompted = await promptInteractive(name, {
      mode,
      framework,
      database,
      billing: billing as unknown as string[],
      features: features as unknown as string[],
      apps: apps as unknown as string[],
      preset: preset as unknown as string | undefined,
      cache: cache as unknown as string | undefined,
      deploy: deploy as unknown as string | undefined,
      customFeatures: [
        ...(options.withAuth ? ["auth"] : []),
        ...(options.withApi ? ["api"] : []),
        ...(options.withEmail ? ["email"] : []),
        ...(options.withAnalytics ? ["analytics"] : []),
        ...(options.withEve ? ["eve"] : []),
        ...(options.withI18n ? ["i18n"] : []),
        ...(options.withPdf ? ["pdf"] : []),
        ...(options.withMessaging ? ["messaging"] : []),
        ...(options.withStorage ? ["storage"] : []),
        ...(options.withNotifications ? ["notifications"] : []),
        ...(options.featureFlags === "posthog" ? ["featureFlags"] : []),
        ...(options.withJobs ? ["jobs"] : []),
      ],
      noInstall,
    });
    if (prompted.cancelled) return prompted.exitCode ?? ExitCode.CANCELLED;

    name = prompted.name;
    mode = prompted.mode as unknown as ProjectMode;
    framework = prompted.framework as unknown as FrameworkName;
    database = prompted.database as unknown as DatabaseProvider;
    databaseWasExplicit = true;
    billing = prompted.billing as unknown as BillingProviderName[];
    let rawFeatures = prompted.features as unknown as string[];
    apps = prompted.apps as unknown as AppName[];
    preset = prompted.preset as unknown as PresetName | undefined;
    cache = (prompted.cache as unknown as CacheProvider) ?? "none";
    deploy = (prompted.deploy as unknown as typeof deploy) ?? "none";
    // Decode custom preset __custom_ prefixes from prompts.ts
    if (preset === "custom" && rawFeatures) {
      const decoded: string[] = [];
      for (const f of rawFeatures) {
        if (f === "__custom_auth") interactiveCustomAuth = true;
        else if (f === "__custom_api") interactiveCustomApi = true;
        else if (f === "__custom_email") interactiveCustomEmail = true;
        else if (f === "__custom_analytics") interactiveCustomAnalytics = true;
        else if (f === "__custom_eve") interactiveCustomEve = true;
        else if (f === "__custom_i18n") interactiveCustomI18n = true;
        else if (f === "__custom_pdf") interactiveCustomPdf = true;
        else if (f === "__custom_messaging") interactiveCustomMessaging = true;
        else if (f === "__custom_storage") interactiveCustomStorage = true;
        else if (f === "__custom_notifications") interactiveCustomNotifications = true;
        else if (f === "__custom_featureFlags") interactiveCustomFeatureFlags = true;
        else if (f === "__custom_jobs") interactiveCustomJobs = true;
        else decoded.push(f);
      }
      rawFeatures = decoded;
      if (interactiveCustomAuth === undefined) interactiveCustomAuth = false;
      if (interactiveCustomApi === undefined) interactiveCustomApi = false;
      if (interactiveCustomEmail === undefined) interactiveCustomEmail = false;
      if (interactiveCustomAnalytics === undefined) interactiveCustomAnalytics = false;
      if (interactiveCustomEve === undefined) interactiveCustomEve = false;
      if (interactiveCustomI18n === undefined) interactiveCustomI18n = false;
      if (interactiveCustomPdf === undefined) interactiveCustomPdf = false;
      if (interactiveCustomMessaging === undefined) interactiveCustomMessaging = false;
      if (interactiveCustomStorage === undefined) interactiveCustomStorage = false;
      if (interactiveCustomNotifications === undefined) interactiveCustomNotifications = false;
      if (interactiveCustomFeatureFlags === undefined) interactiveCustomFeatureFlags = false;
      if (interactiveCustomJobs === undefined) interactiveCustomJobs = false;
      // Also handle eve/i18n via separate features multiselect when custom (if user selected via features)
      if (rawFeatures.includes("eve" as string)) interactiveCustomEve = true;
      if (rawFeatures.includes("i18n" as string)) interactiveCustomI18n = true;
      rawFeatures = rawFeatures.filter((f) => f !== "eve" && f !== "i18n") as unknown as string[];
    }
    // Also handle __custom_pdf for saas preset (pdf via features multiselect)
    if (rawFeatures && rawFeatures.includes("__custom_pdf")) {
      interactiveCustomPdf = true;
      rawFeatures = rawFeatures.filter((f) => f !== "__custom_pdf");
    }
    if (rawFeatures && rawFeatures.includes("__custom_messaging")) {
      interactiveCustomMessaging = true;
      rawFeatures = rawFeatures.filter((f) => f !== "__custom_messaging");
    }
    if (rawFeatures && rawFeatures.includes("__custom_storage")) {
      interactiveCustomStorage = true;
      rawFeatures = rawFeatures.filter((f) => f !== "__custom_storage");
    }
    if (rawFeatures && rawFeatures.includes("__custom_notifications")) {
      interactiveCustomNotifications = true;
      rawFeatures = rawFeatures.filter((f) => f !== "__custom_notifications");
    }
    if (rawFeatures && rawFeatures.includes("__custom_featureFlags")) {
      interactiveCustomFeatureFlags = true;
      rawFeatures = rawFeatures.filter((f) => f !== "__custom_featureFlags");
    }
    if (rawFeatures && rawFeatures.includes("__custom_jobs")) {
      interactiveCustomJobs = true;
      rawFeatures = rawFeatures.filter((f) => f !== "__custom_jobs");
    }
    features = rawFeatures as unknown as FeatureName[];
    // stack shorthand is already mapped to framework/apps inside promptInteractive
    noInstall = prompted.noInstall;
  } else {
    validateProjectName(name ?? "");
  }

  const projectName = name as string;
  const resolution = resolveCreateConfig({
    name: projectName,
    runtime: options.runtime,
    mode,
    framework,
    billing,
    features,
    database,
    databaseWasExplicit,
    apps,
    preset,
    cache,
    deploy,
    withAuth: interactiveCustomAuth ?? options.withAuth,
    withApi: interactiveCustomApi ?? options.withApi,
    withEmail: interactiveCustomEmail ?? options.withEmail,
    withAnalytics: interactiveCustomAnalytics ?? options.withAnalytics,
    withEve: interactiveCustomEve ?? options.withEve,
    withI18n: interactiveCustomI18n ?? options.withI18n,
    withPdf: interactiveCustomPdf ?? options.withPdf,
    withMessaging: interactiveCustomMessaging ?? options.withMessaging,
    withStorage: interactiveCustomStorage ?? options.withStorage,
    withNotifications: interactiveCustomNotifications ?? options.withNotifications,
    featureFlags: interactiveCustomFeatureFlags === true ? "posthog" : options.featureFlags,
    withJobs: interactiveCustomJobs ?? options.withJobs,
  });
  if (!resolution.ok) {
    const warning = resolution.message;
    options.logger.warn(warning);
    if (options.json) {
      printJson(
        envelope({
          success: false,
          exitCode: ExitCode.INVALID_ARGUMENTS,
          error: {
            message: warning,
            code: exitCodeName(ExitCode.INVALID_ARGUMENTS),
            details: {
              reason: resolution.reason,
              unsupportedSelections: resolution.unsupportedSelections,
            },
          },
          data: {
            warning,
            incompatible: true,
            reason: resolution.reason,
            unsupportedSelections: resolution.unsupportedSelections,
            billing,
            database,
            mode,
            framework,
            features,
            apps,
          },
          command: "create",
          durationMs: durationMs(),
        }),
      );
    } else {
      options.logger.error(
        resolution.reason === "single-native-server-capabilities-unsupported"
          ? warning
          : `${warning}. Choose compatible options (e.g., add postgres for billing).`,
      );
    }
    return ExitCode.INVALID_ARGUMENTS;
  }

  const config = resolution.config;
  const desiredConfig = resolution.desiredConfig;
  const resolvedProjectConfig = resolution.resolvedConfig;
  database = config.database;
  const effectivePreset = config.preset;
  const effectiveCache = config.cache;
  const projectRoot = join(options.cwd, projectName);

  if (!options.dryRun && existsSync(projectRoot) && !options.force) {
    throw new ConflictError(`Target directory already exists: ${projectRoot}`);
  }

  const { filesWritten, installFailed, stagedFiles, totalBytes, isDryRun, plan } =
    await runProjectInstall({
      projectName,
      projectRoot,
      config,
      desiredConfig,
      resolvedConfig: resolvedProjectConfig,
      options,
      noInstall,
      requireAbsentTarget: !options.force,
    });

  if (isDryRun) {
    const previewFiles = (stagedFiles ?? []).slice(0, 100).map((f) => ({ ...f }));
    const hasMore = (stagedFiles?.length ?? 0) > 100;
    if (options.json) {
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: {
            projectName,
            projectRoot,
            filesWritten,
            installFailed: false,
            dryRun: true,
            totalBytes: totalBytes ?? 0,
            files: stagedFiles ?? [],
            previewFiles,
            hasMore,
            mode,
            framework,
            billing,
            features,
            database,
            apps,
            preset: effectivePreset,
            cache: effectiveCache,
            deploy,
            resolvedConfig: config,
            resolvedProjectConfig,
            configHash: plan.projectConfigHash,
            planHash: plan.planHash,
            plan: publicGenerationPlan(plan),
          },
          command: "create",
          durationMs: durationMs(),
        }),
      );
    } else {
      const kb = totalBytes ? (totalBytes / 1024).toFixed(1) : "0";
      options.logger.info(
        `Dry run — would create ${filesWritten} files (${kb} kB) at ${projectRoot}`,
      );
      const toShow = previewFiles;
      for (const f of toShow) {
        options.logger.info(`  ${f.path} (${f.bytes} B)`);
      }
      if (hasMore) {
        options.logger.info(`  ... and ${(stagedFiles?.length ?? 0) - 100} more files`);
      }
      options.logger.info(`Run without --dry-run to create the project`);
    }
    return ExitCode.OK;
  }

  if (options.json) {
    printJson(
      envelope({
        success: !installFailed,
        exitCode: installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK,
        data: {
          projectName,
          projectRoot,
          filesWritten,
          installFailed,
          mode,
          framework,
          billing,
          features,
          database,
          apps,
          preset: effectivePreset,
          cache: effectiveCache,
          deploy,
          resolvedConfig: config,
          resolvedProjectConfig,
          configHash: plan.projectConfigHash,
          planHash: plan.planHash,
        },
        error: installFailed
          ? {
              message:
                "Project files were generated, but dependency installation or formatting failed",
              code: exitCodeName(ExitCode.GENERATION_ERROR),
            }
          : undefined,
        command: "create",
        durationMs: durationMs(),
      }),
    );
  } else if (!options.json) {
    options.logger.info(`Created ${projectName} with ${filesWritten} files at ${projectRoot}`);
  }

  return installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK;
}
