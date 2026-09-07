import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { jobsActionsContent } from "./actions.js";
import { jobsContextContent } from "./context.js";
import { jobsContractContent } from "./contract.js";
import { jobsDtoContent } from "./dto.js";
import { jobsProceduresContent } from "./procedures.js";
import { jobsSchemasContent } from "./schemas.js";
import { jobsApiRoot } from "./shared.js";

function jobsApiIndexContent(): string {
  return `export { jobsContract } from "./contract.js";
export { createJobActions } from "./actions.js";
export { createJobProcedures, type JobProcedures } from "./procedures.js";
export { requireJobActor, type JobsTransportContext, type ResolveJobsService } from "./context.js";
`;
}

export function jobsApiFiles(mode: ProjectMode): TemplateFile[] {
  const root = jobsApiRoot(mode);
  return [
    file(`${root}/schemas.ts`, jobsSchemasContent()),
    file(`${root}/contract.ts`, jobsContractContent()),
    file(`${root}/context.ts`, jobsContextContent(mode)),
    file(`${root}/dto.ts`, jobsDtoContent(mode)),
    file(`${root}/actions.ts`, jobsActionsContent(mode)),
    file(`${root}/procedures.ts`, jobsProceduresContent()),
    file(`${root}/index.ts`, jobsApiIndexContent()),
  ];
}

export interface JobsApiIntegrationGuide {
  rendererImport: string;
  rendererCall: string;
  contractImport: string;
  contractEntry: string;
  contextField: string;
  routerEntry: string;
  compositionInstruction: string;
  workerInstruction: string;
}

export function jobsApiIntegrationGuide(mode: ProjectMode): JobsApiIntegrationGuide {
  const serviceModule = mode === "monorepo" ? "@repo/services/jobs" : "@/server/services/jobs";
  return {
    rendererImport: `import { jobsApiFiles } from "./api/jobs/index.js";`,
    rendererCall: `files.push(...jobsApiFiles("${mode}"));`,
    contractImport: `import { jobsContract } from "./jobs/contract.js";`,
    contractEntry: `jobs: jobsContract,`,
    contextField: `jobActor?: import("${serviceModule}").JobActor | null;`,
    routerEntry: `jobs: createJobProcedures<ApiContext>((context) => createJobsServiceForRequest(context)),`,
    compositionInstruction:
      "Create a request-scoped JobsService from the selected PostgresJobsAdapter or ConvexJobsAdapter, schedule calculator, and cryptographic lease-token source.",
    workerInstruction:
      "Run schedules.tick and workers.recoverExpiredLeases from one internal scheduler; worker claim/heartbeat/settle methods are intentionally not public oRPC operations.",
  };
}
