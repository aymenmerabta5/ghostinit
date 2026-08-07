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
import { deployFiles } from "./deploy.js";
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
): TemplateFile[] {
  return [
    rootPackageJson(projectName, runtime, addonMap),
    ...(runtime === "bun" ? [bunfig()] : []),
    turbo(runtime),
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
    ...deployFiles(projectName, deploy),
  ];
}

export {
  envExampleContent as envPlaceholderContent,
  envExampleContent,
  envLocalContent,
} from "../shared/env.js";
