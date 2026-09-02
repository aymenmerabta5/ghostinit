import type { TemplateFile } from "../shared.js";
import type { GenerateContext } from "../shared.js";
import type { RootSecrets } from "./secrets.js";
import { rootPackageJson, bunfig } from "./package.js";
import { turbo } from "./turbo.js";
import {
  rootTsConfig,
  oxlintConfig,
  oxlintIgnore,
  oxfmtConfig,
  dockerCompose,
  gitignore,
  readme,
  githubWorkflow,
} from "./config.js";
import { envExample, envLocal, webEnvLocal } from "./env.js";
import { huskyFiles } from "./husky.js";
import { deployFiles, type DeploymentProfile } from "./deploy.js";
import {
  dependencyAuditFiles,
  integrateDependencyAuditManifest,
} from "../tooling/dependency-audit.js";
import type { AddonInstallerMap } from "../../lib/addons.js";
import type { DeployTarget } from "../../lib/addons.js";
export type { RootSecrets } from "./secrets.js";
export { billingEnvPlaceholders } from "./secrets.js";

export function rootFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
  runtime: "node" | "bun" = "bun",
  addonMap?: AddonInstallerMap | Record<string, { inUse: boolean }>,
  deploy: DeployTarget = "none",
  profile?: Partial<DeploymentProfile>,
): TemplateFile[] {
  const envAudience = profile
    ? {
        framework: profile.framework,
        hasWeb: profile.apps?.includes("web") ?? true,
        hasMobile: profile.apps?.includes("mobile") ?? false,
        hasDesktop: profile.apps?.includes("desktop") ?? false,
        hasEve: profile.eve === true,
      }
    : undefined;
  const hasImageSizePatch = profile?.apps?.includes("mobile") ?? false;
  const packageFile = integrateDependencyAuditManifest(
    rootPackageJson(projectName, runtime, addonMap, profile),
    hasImageSizePatch,
  );
  return [
    packageFile,
    bunfig(),
    turbo(runtime, envAudience),
    rootTsConfig(),
    oxlintConfig(),
    oxlintIgnore(),
    oxfmtConfig(),
    dockerCompose(),
    envExample(projectName, secrets, ctx),
    envLocal(projectName, secrets, ctx),
    webEnvLocal(projectName, secrets, ctx),
    gitignore(),
    readme(projectName, runtime),
    githubWorkflow(runtime),
    ...huskyFiles(),
    ...dependencyAuditFiles(hasImageSizePatch),
    ...deployFiles(projectName, deploy, runtime, profile),
  ];
}

export {
  envExampleContent as envPlaceholderContent,
  envExampleContent,
  envLocalContent,
} from "../shared/env.js";
