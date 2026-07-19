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
export type { RootSecrets } from "./secrets.js";
export { billingEnvPlaceholders } from "./secrets.js";

export function rootFiles(
  projectName: string,
  secrets: RootSecrets,
  ctx: GenerateContext,
  runtime: "node" | "bun" = "bun",
): TemplateFile[] {
  return [
    rootPackageJson(projectName, runtime),
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
  ];
}

export {
  envExampleContent as envPlaceholderContent,
  envExampleContent,
  envLocalContent,
} from "../shared/env.js";
