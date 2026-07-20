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

  // Single mode — flat Next.js no workspaces via singleFiles
  const secrets: RootSecrets = {
    authSecret: secret(),
    postgresPassword: secret(),
    resendApiKey: secret(),
    stripeSecretKey: secret(),
    stripeWebhookSecret: secret(),
    stripePublishableKey: `pk_test_${secret().slice(0, 32)}`,
    chargilyApiKey: secret(),
    chargilySecretKey: secret(),
    paddleApiKey: secret(),
    paddleWebhookSecret: secret(),
    paddleClientToken: `pdl_ntf_${secret().slice(0, 24)}`,
    polarAccessToken: secret(),
    polarWebhookSecret: secret(),
    polarOrgId: secret(),
  };

  const addonMap = buildAddonInstallerMap({
    billing: (config.billing ?? []) as BillingProviderName[],
    features: (config.features ?? []) as FeatureName[],
    database: (config.database ?? "postgres") as DatabaseProvider,
    mode,
    framework: (config.framework ?? "nextjs") as FrameworkName,
    apps: (config.apps ?? ["web"]) as AppName[],
  });

  return singleFiles(config, secrets, { dryRun: ctx.dryRun }, addonMap).map((f) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}
