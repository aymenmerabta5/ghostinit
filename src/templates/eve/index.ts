import { file, type TemplateFile } from "../shared.js";
import type { BillingProviderName } from "../../lib/addons.js";
import { evePackageJson } from "./package.js";
import { eveGitignore, eveNitroConfig, eveReadme, eveTsconfig, eveVercelIgnore } from "./config.js";
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

export function eveFiles(
  projectName: string,
  runtime: "node" | "bun" = "bun",
  selectedBilling: readonly BillingProviderName[] = [],
): TemplateFile[] {
  const isBun = runtime === "bun";
  return [
    evePackageJson(projectName, isBun),
    eveNitroConfig(),
    eveTsconfig(),
    eveGitignore(),
    eveVercelIgnore(),
    eveReadme(projectName),
    file(
      "apps/eve/tests/agent.test.ts",
      `import { describe, expect, it } from "bun:test";
import agent from "../agent/agent.js";

describe("Eve agent smoke", () => {
  it("loads the generated agent definition", () => {
    expect(agent).toBeDefined();
  });
});
`,
    ),
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
    scheduleSyncCheckExample(),
    ...(selectedBilling.includes("chargily")
      ? [scheduleBillingRenewal(), scheduleBillingRenewalExample()]
      : []),
  ];
}

export { evePackageJson } from "./package.js";
