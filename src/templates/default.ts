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
} from "../lib/addons.js";
import { monorepoFiles } from "./modes/monorepo.js";
import { singleFiles } from "./modes/single.js";

export function generateProjectFiles(
  config: ProjectConfig,
  ctx: GenerateContext = { dryRun: false },
): TemplateFile[] {
  const mode = (config.mode ?? "monorepo") as ProjectMode;

  if (mode === "monorepo") {
    return monorepoFiles(config, undefined, { dryRun: ctx.dryRun });
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
    database: (config.database ?? "postgres") as DatabaseProvider,
    mode,
    framework: (config.framework ?? "nextjs") as FrameworkName,
    apps: (config.apps ?? ["web"]) as AppName[],
    preset: (config.preset ?? "saas") as PresetName,
    cache: (config.cache ?? "none") as CacheProvider,
    auth: config.auth,
    api: config.api,
    email: config.email,
    analytics: config.analytics,
  });

  return singleFiles(config, secrets, { dryRun: ctx.dryRun }, addonMap).map((f) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}
