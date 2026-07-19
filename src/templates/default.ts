// Default GhostInit project template.
// Manifest is single source of truth for generated v0.1 monorepo.
// No timestamps or machine paths; CLI injects those into external state files only.
// When mode = monorepo delegates to monorepoFiles assembler in modes/monorepo.ts
// which implements 12+ groups: rootFiles packageFiles databasePackage startDatabaseFiles
// authPackage with Resend hook apiPackage uiPackage modulesPackage appsFiles with withEve hybrid
// if eve feature toolingFiles agenticFiles eveFiles conditional if eve billingFiles conditional
// if billing not none emailFiles default resend servicesFiles oRPC contract-first webhooks via Next routes i18nFiles conditional.
// oRPC contract-first — webhooks via Next.js routes raw Buffer, single port 3000.
// Workspaces apps-star packages-star tooling-star cover packages-services billing email via packages-star glob.
// Env example conditional billing keys RESEND POLAR PADDLE STRIPE CHARGILY only if chosen else placeholder comment.
// Import alias at always at-slash-star -> dot-slash-src-star + at-repo-star -> packages-star-src via typescript-config paths.
// AGENTS.md updated with billing flexible + services + layered 6 layers + oRPC contract-first + dual modes.
// Bun only.

import type { ProjectConfig } from "../lib/config.js";
import type { GenerateContext, TemplateFile } from "./shared.js";
import { secret } from "./shared.js";
import type { RootSecrets } from "./root.js";
import { buildAddonInstallerMap } from "../lib/addons.js";
import { monorepoFiles } from "./modes/monorepo.js";
import { singleFiles } from "./modes/single.js";

export function generateProjectFiles(
  config: ProjectConfig,
  ctx: GenerateContext = { dryRun: false },
): TemplateFile[] {
  if (ctx.dryRun) {
    // Treat external dry-run the same as project dry-run; template code only uses ctx.
  }

  const mode = (config.mode ?? "monorepo") as "monorepo" | "single";

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
    billing: config.billing ?? [],
    features: config.features ?? [],
    database: config.database ?? "postgres",
    mode: (config.mode ?? "monorepo") as any,
    framework: (config.framework ?? "nextjs") as any,
  });

  return singleFiles(config, secrets, { dryRun: ctx.dryRun } as any, addonMap as any).map((f) => ({
    path: f.path.replace(/__PROJECT_NAME__/g, config.name),
    content: f.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}
