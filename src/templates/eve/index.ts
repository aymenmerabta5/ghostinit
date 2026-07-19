import type { TemplateFile } from "../shared.js";
import { evePackageJson } from "./package.js";
import { eveTsconfig, eveGitignore, eveVercelIgnore, eveReadme } from "./config.js";
import { eveAgentFile, eveInstructionsFile } from "./agent/core.js";
import { toolScaffoldModule } from "./tools/scaffold.js";
import { toolCheckArchitecture } from "./tools/check.js";
import { toolSyncRegistries } from "./tools/sync.js";
import { toolListModules } from "./tools/list.js";
import { toolDbMigrate } from "./tools/db.js";
import { skillGhostinitWorkflow } from "./skills/workflow.js";
import { skillModuleDesign } from "./skills/module-design.js";
import { channelEve } from "./channels/eve-channel.js";
import { scheduleSyncCheck, scheduleSyncCheckExample } from "./schedules/sync-check.js";
import { scheduleBillingRenewal, scheduleBillingRenewalExample } from "./schedules/billing.js";

export function eveFiles(projectName: string, runtime: "node" | "bun" = "bun"): TemplateFile[] {
  const isBun = runtime === "bun";
  return [
    evePackageJson(projectName, isBun),
    eveTsconfig(),
    eveGitignore(),
    eveVercelIgnore(),
    eveReadme(projectName),
    eveAgentFile(),
    eveInstructionsFile(projectName),
    toolScaffoldModule(),
    toolCheckArchitecture(),
    toolSyncRegistries(),
    toolListModules(),
    toolDbMigrate(),
    skillGhostinitWorkflow(),
    skillModuleDesign(),
    channelEve(projectName),
    scheduleSyncCheck(),
    scheduleBillingRenewal(),
    scheduleBillingRenewalExample(),
    scheduleSyncCheckExample(),
  ];
}

export { evePackageJson } from "./package.js";
