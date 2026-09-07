import { join } from "node:path";
import { existsSync } from "node:fs";
import { ExitCode, ConflictError, exitCodeName } from "../../lib/errors.js";
import { projectConfigSchema } from "../../lib/config.js";
import { envelope, printJson } from "../../lib/json.js";
import type { GlobalOptions } from "../types.js";
import { validateProjectName, isValidAddonCombo } from "./validation.js";
import { getIsInteractive, promptInteractive } from "./prompts.js";
import { runProjectInstall } from "./installer.js";
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
  const start = Date.now();
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
  // Interactive custom decoded flags lifted to outer scope
  let interactiveCustomAuth: boolean | undefined;
  let interactiveCustomApi: boolean | undefined;
  let interactiveCustomEmail: boolean | undefined;
  let interactiveCustomAnalytics: boolean | undefined;
  let interactiveCustomEve: boolean | undefined;
  let interactiveCustomI18n: boolean | undefined;
  let interactiveCustomPdf: boolean | undefined;
  let interactiveCustomMessaging: boolean | undefined;

  const interactive = getIsInteractive(options);

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
      noInstall,
    });
    if (prompted.cancelled) return prompted.exitCode ?? ExitCode.CANCELLED;

    name = prompted.name;
    mode = prompted.mode as unknown as ProjectMode;
    framework = prompted.framework as unknown as FrameworkName;
    database = prompted.database as unknown as DatabaseProvider;
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
    features = rawFeatures as unknown as FeatureName[];
    // stack shorthand is already mapped to framework/apps inside promptInteractive
    noInstall = prompted.noInstall;
  } else {
    validateProjectName(name ?? "");
    // Non-interactive: handle stack shorthand and preset defaults for database
    // If preset is frontend and database not explicitly set via CLI flag, default to none
    const rawDatabase = (options as unknown as Record<string, unknown>).rawDatabase as
      | string[]
      | undefined;
    const hasExplicitDatabase = rawDatabase && rawDatabase.length > 0;
    if (preset === "frontend" && !hasExplicitDatabase && database === "postgres") {
      // frontend preset without explicit --database should be none (minimal)
      database = "none" as DatabaseProvider;
    }
  }

  // Derive hasAuth for validation: saas implies auth, frontend implies no auth unless custom with with-auth, api flags handled via preset
  const hasAuthForCombo =
    preset === "saas"
      ? true
      : preset === "frontend"
        ? false
        : preset === "custom"
          ? (options as unknown as Record<string, unknown>)["with-auth"] === true
            ? true
            : false
          : billing.length > 0
            ? undefined
            : undefined;
  const hasMessagingForCombo =
    (options as unknown as Record<string, unknown>)["with-messaging"] === true ||
    interactiveCustomMessaging === true;
  const hasEveForCombo =
    features.includes("eve" as FeatureName) || options.withEve === true || interactiveCustomEve === true;
  const hasPdfForCombo = options.withPdf === true || interactiveCustomPdf === true;
  const combo = isValidAddonCombo({
    billing: billing as unknown as BillingProviderName[],
    database,
    mode,
    framework: framework as unknown as FrameworkName,
    apps: apps as unknown as AppName[],
    preset: preset as unknown as PresetName | undefined,
    cache: cache as unknown as CacheProvider | undefined,
    hasAuth: hasAuthForCombo as boolean | undefined,
    hasMessaging: hasMessagingForCombo,
    hasEve: hasEveForCombo,
    hasPdf: hasPdfForCombo,
    deploy,
  });
  if (!combo.valid) {
    const warning = combo.message ?? "Incompatible addon combination";
    options.logger.warn(warning);
    if (options.json) {
      printJson(
        envelope({
          success: false,
          exitCode: ExitCode.INVALID_ARGUMENTS,
          error: { message: warning, code: exitCodeName(ExitCode.INVALID_ARGUMENTS) },
          data: {
            warning,
            incompatible: true,
            billing,
            database,
            mode,
            framework,
            features,
            apps,
            deploy,
          },
          command: "create",
          durationMs: Date.now() - start,
        }),
      );
    } else {
      options.logger.error(
        `${warning}. Choose compatible options (e.g., add postgres for billing).`,
      );
    }
    return ExitCode.INVALID_ARGUMENTS;
  }

  const projectName = name as string;
  const projectRoot = join(options.cwd, projectName);

  // Normalize preset: default to saas for --yes or when no preset supplied (backward compat)
  let effectivePreset: PresetName = preset ?? "saas";
  if (!preset && !options.yes) {
    effectivePreset = "saas";
  }
  const effectiveCache: CacheProvider = cache ?? "none";

  // Determine fine-grained flags for custom preset
  let effectiveAuth: boolean | undefined;
  let effectiveApi: boolean | undefined;
  let effectiveEmail: boolean | undefined;
  let effectiveAnalytics: boolean | undefined;
  let effectiveEve: boolean | undefined;
  let effectiveI18n: boolean | undefined;
  let effectivePdf: boolean | undefined;
  let effectiveMessaging: boolean | undefined;
  const withAuthFlag = options.withAuth;
  const withApiFlag = options.withApi;
  const withEmailFlag = options.withEmail;
  const withAnalyticsFlag = options.withAnalytics;
  const withEveFlag = options.withEve;
  const withI18nFlag = options.withI18n;
  const withPdfFlag = (options as unknown as Record<string, unknown>).withPdf as
    | boolean
    | undefined;
  const withMessagingFlag = (options as unknown as Record<string, unknown>).withMessaging as
    | boolean
    | undefined;

  if (effectivePreset === "custom") {
    // Prefer interactive decoded values if present, else CLI with-* flags
    if (interactiveCustomAuth !== undefined) effectiveAuth = interactiveCustomAuth;
    else if (withAuthFlag !== undefined) effectiveAuth = withAuthFlag;
    if (interactiveCustomApi !== undefined) effectiveApi = interactiveCustomApi;
    else if (withApiFlag !== undefined) effectiveApi = withApiFlag;
    if (interactiveCustomEmail !== undefined) effectiveEmail = interactiveCustomEmail;
    else if (withEmailFlag !== undefined) effectiveEmail = withEmailFlag;
    if (interactiveCustomAnalytics !== undefined) effectiveAnalytics = interactiveCustomAnalytics;
    else if (withAnalyticsFlag !== undefined) effectiveAnalytics = withAnalyticsFlag;
    if (interactiveCustomEve !== undefined) effectiveEve = interactiveCustomEve;
    else if (withEveFlag !== undefined) effectiveEve = withEveFlag;
    if (interactiveCustomI18n !== undefined) effectiveI18n = interactiveCustomI18n;
    else if (withI18nFlag !== undefined) effectiveI18n = withI18nFlag;
    if (interactiveCustomPdf !== undefined) effectivePdf = interactiveCustomPdf;
    else if (withPdfFlag !== undefined) effectivePdf = withPdfFlag;
    if (interactiveCustomMessaging !== undefined) effectiveMessaging = interactiveCustomMessaging;
    else if (withMessagingFlag !== undefined) effectiveMessaging = withMessagingFlag;
    // For interactive custom, cache comes from the prompts (redis when the cache feature is selected)
  } else if (effectivePreset === "frontend") {
    effectiveAuth = false;
    effectiveApi = false;
    effectiveEmail = false;
    effectiveAnalytics = false;
    effectiveEve = features.includes("eve" as never) || withEveFlag === true;
    effectiveI18n = features.includes("i18n" as never) || withI18nFlag === true;
    effectivePdf = interactiveCustomPdf === true || withPdfFlag === true;
    effectiveMessaging = interactiveCustomMessaging === true || withMessagingFlag === true;
  } else if (effectivePreset === "saas") {
    effectiveAuth = true;
    effectiveApi = true;
    effectiveEmail = true;
    effectiveAnalytics = true;
    effectiveEve = features.includes("eve" as never) || withEveFlag === true;
    effectiveI18n = features.includes("i18n" as never) || withI18nFlag === true;
    effectivePdf = interactiveCustomPdf === true || withPdfFlag === true;
    effectiveMessaging = interactiveCustomMessaging === true || withMessagingFlag === true;
  } else {
    // no preset case already handled as saas via effectivePreset default
    if (withPdfFlag === true) effectivePdf = true;
    if (withMessagingFlag === true) effectiveMessaging = true;
  }

  // Merge with with-* overrides even for saas/frontend (allow --with-cache on frontend)
  if (withAuthFlag === true) effectiveAuth = true;
  if (withAuthFlag === false && effectivePreset === "custom") effectiveAuth = false;
  if (withApiFlag === true) effectiveApi = true;
  if (withEmailFlag === true) effectiveEmail = true;
  if (withAnalyticsFlag === true) effectiveAnalytics = true;
  // with-cache maps to cache=redis in parseCreateArgs; effectiveCache already reflects it
  if (withEveFlag === true) effectiveEve = true;
  if (withI18nFlag === true) effectiveI18n = true;
  if (withPdfFlag === true) effectivePdf = true;
  if (withPdfFlag === false && effectivePreset === "custom" && interactiveCustomPdf === undefined) {
    effectivePdf = false;
  }
  if (withMessagingFlag === true) effectiveMessaging = true;
  if (
    withMessagingFlag === false &&
    effectivePreset === "custom" &&
    interactiveCustomMessaging === undefined
  ) {
    effectiveMessaging = false;
  }

  const config = projectConfigSchema.parse({
    name: projectName,
    runtime: options.runtime,
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    mode,
    framework,
    billing,
    features: features.filter((f) => f !== "eve" && f !== "i18n"),
    database,
    apps,
    preset: effectivePreset,
    cache: effectiveCache,
    deploy,
    auth: effectiveAuth,
    api: effectiveApi,
    email: effectiveEmail,
    analytics: effectiveAnalytics,
    eve: effectiveEve,
    i18n: effectiveI18n,
    pdf: effectivePdf,
    messaging: effectiveMessaging,
  });

  if (existsSync(projectRoot) && !options.force) {
    throw new ConflictError(`Target directory already exists: ${projectRoot}`);
  }

  const { filesWritten, installFailed, stagedFiles, totalBytes, isDryRun } =
    await runProjectInstall({
      projectName,
      projectRoot,
      config,
      options,
      noInstall,
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
          },
          command: "create",
          durationMs: Date.now() - start,
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
        },
        command: "create",
        durationMs: Date.now() - start,
      }),
    );
  } else if (!options.json) {
    options.logger.info(`Created ${projectName} with ${filesWritten} files at ${projectRoot}`);
  }

  return installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK;
}
