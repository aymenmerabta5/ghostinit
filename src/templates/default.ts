// Default GhostInit project template.

import type { ProjectConfig } from "../lib/config.js";
import type { GenerateContext, TemplateFile } from "./shared.js";
import { secret } from "./shared.js";
import type { RootSecrets } from "./root.js";
import {
  buildAddonInstallerMap,
  type BillingProviderName,
  type FeatureName,
  type DatabaseProvider,
  type FrameworkName,
  type ProjectMode,
  type AppName,
  type PresetName,
  type CacheProvider,
  type DeployTarget,
  isValidAddonCombo,
} from "../lib/addons.js";
import { ValidationError } from "../lib/errors.js";
import { monorepoFiles } from "./modes/monorepo.js";
import { singleFiles } from "./modes/single.js";
import { maybeValidateGeneratedFiles } from "../lib/template-validator.js";

export function generateProjectFiles(
  config: ProjectConfig,
  ctx: GenerateContext = { dryRun: false },
): TemplateFile[] {
  const mode = (config.mode ?? "monorepo") as ProjectMode;
  const framework = (config.framework ?? "nextjs") as FrameworkName;
  const database = (config.database ?? "postgres") as DatabaseProvider;
  const apps = (config.apps ?? ["web"]) as AppName[];
  const preset = (config.preset ?? "saas") as PresetName;
  const deploy = (config.deploy ?? "none") as DeployTarget;
  const hasEve = Boolean(config.eve || (config.features ?? []).includes("eve"));
  if (deploy === "cloudflare") {
    const compatibility = isValidAddonCombo({
      billing: (config.billing ?? []) as BillingProviderName[],
      database,
      mode,
      framework,
      apps,
      preset,
      cache: (config.cache ?? "none") as CacheProvider,
      hasAuth: config.auth ?? preset === "saas",
      hasMessaging: config.messaging ?? false,
      hasEve,
      hasPdf: config.pdf ?? false,
      deploy,
    });
    if (!compatibility.valid) {
      throw new ValidationError(compatibility.message ?? "Incompatible project configuration");
    }
  }

  if (mode === "monorepo") {
    const files = monorepoFiles(config, undefined, { dryRun: ctx.dryRun });
    maybeValidateGeneratedFiles(files, ctx);
    return files;
  }

  // Single mode — flat Next.js no workspaces via singleFiles.
  //
  // Only self-issued secrets are minted here. Billing provider credentials are
  // issued BY the provider and are deliberately left undefined so the env writer
  // emits REPLACE_WITH_* placeholders: a generated value would satisfy every
  // webhook's `secret.startsWith("REPLACE_WITH")` guard and turn a clear
  // 400 "not configured" into an opaque 403 signature failure.
  const secrets: RootSecrets = {
    authSecret: secret(),
    postgresPassword: secret(),
  };

  const addonMap = buildAddonInstallerMap({
    billing: (config.billing ?? []) as BillingProviderName[],
    features: (config.features ?? []) as FeatureName[],
    database,
    mode,
    framework,
    apps,
    preset,
    cache: (config.cache ?? "none") as CacheProvider,
    deploy,
    auth: config.auth,
    api: config.api,
    email: config.email,
    analytics: config.analytics,
    eve: config.eve,
    i18n: config.i18n,
    pdf: config.pdf,
    messaging: config.messaging,
  });

  const singleResult = singleFiles(config, secrets, { dryRun: ctx.dryRun }, addonMap).map((f) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
  maybeValidateGeneratedFiles(singleResult, ctx);
  return singleResult;
}
