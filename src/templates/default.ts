/**
 * Default GhostInit project template.
 *
 * This manifest is the single source of truth for the generated v0.1 monorepo.
 * It intentionally contains no timestamps or machine paths; the CLI injects
 * those into external state files only.
 */

import type { ProjectConfig } from "../lib/config.js";
import type { GenerateContext, TemplateFile } from "./shared.js";
import { secret } from "./shared.js";
import type { RootSecrets } from "./root.js";
import { rootFiles } from "./root.js";
import { packageFiles } from "./packages.js";
import { databasePackage } from "./database.js";
import { authPackage } from "./auth.js";
import { apiPackage } from "./api.js";
import { uiPackage } from "./ui.js";
import { modulesPackage } from "./modules.js";
import { appsFiles } from "./apps/index.js";
import { toolingFiles } from "./tooling.js";

export function generateProjectFiles(
  config: ProjectConfig,
  ctx: GenerateContext = { dryRun: false },
): TemplateFile[] {
  if (ctx.dryRun) {
    // Treat external dry-run the same as project dry-run; template code only uses ctx.
  }

  const secrets: RootSecrets = {
    authSecret: secret(),
    postgresPassword: secret(),
  };

  const files: TemplateFile[] = [
    ...rootFiles(config.name, secrets, ctx, config.runtime),
    ...packageFiles(config.runtime),
    ...databasePackage(),
    ...authPackage(),
    ...apiPackage(),
    ...uiPackage(),
    ...modulesPackage(config.runtime),
    ...appsFiles(config.runtime),
    ...toolingFiles(),
  ];

  return files.map((file) => ({
    path: file.path.replace(/__PROJECT_NAME__/g, config.name),
    content: file.content.replace(/__PROJECT_NAME__/g, config.name),
  }));
}
