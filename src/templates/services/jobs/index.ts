import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";
import { jobsAdapterContractsContent } from "./adapter-contracts.js";
import { jobsContractsContent } from "./contracts.js";
import { jobsErrorsContent } from "./errors.js";
import { jobsPolicyContent } from "./policy.js";
import { jobsPortsContent } from "./ports.js";
import { jobsServiceContent } from "./service.js";
import { jobsServiceRoot } from "./shared.js";

function jobsIndexContent(): string {
  return `import "server-only";
export { createJobsService, type JobsService, type JobsServiceDependencies } from "./service.js";
export { JobError, JOB_ERROR_CODES, isJobError } from "./errors.js";
export {
  DEFAULT_JOB_RETRY_POLICY,
  assertJobActor,
  assertJobWorker,
  calculateJobRetryDelayMs,
  createManualRunIdempotencyKey,
  createScheduledRunIdempotencyKey,
} from "./policy.js";
export { defineConvexJobsAdapter, definePostgresJobsAdapter } from "./adapter-contracts.js";
export { JOB_RUN_STATES } from "./contracts.js";
export type {
  JobActor,
  JobDefinition,
  JobLease,
  JobPayload,
  JobRetryPolicy,
  JobRun,
  JobRunMutationResult,
  JobRunState,
  JobSchedule,
  JobWorker,
} from "./contracts.js";
export type {
  EnqueueJobRunInput,
  EnqueueJobRunResult,
  ExpiredLeaseRecovery,
  JobLeaseTokenPort,
  JobLeaseTransitionResult,
  JobPersistencePort,
  JobScheduleCalculatorPort,
} from "./ports.js";
export type {
  ConvexJobsAdapter,
  JobsAdapterParity,
  PostgresJobsAdapter,
  SupportedJobsAdapter,
} from "./adapter-contracts.js";
`;
}

export function jobsServiceFiles(mode: ProjectMode): TemplateFile[] {
  const root = jobsServiceRoot(mode);
  return [
    file(`${root}/contracts.ts`, jobsContractsContent()),
    file(`${root}/errors.ts`, jobsErrorsContent()),
    file(`${root}/policy.ts`, jobsPolicyContent()),
    file(`${root}/ports.ts`, jobsPortsContent()),
    file(`${root}/adapter-contracts.ts`, jobsAdapterContractsContent()),
    file(`${root}/service.ts`, jobsServiceContent()),
    file(`${root}/index.ts`, jobsIndexContent()),
  ];
}

export interface JobsServiceIntegrationGuide {
  rendererImport: string;
  rendererCall: string;
  serviceBarrelLine: string;
  packageExport: Readonly<Record<string, string>> | null;
  compositionInstruction: string;
}

export function jobsServiceIntegrationGuide(mode: ProjectMode): JobsServiceIntegrationGuide {
  return {
    rendererImport: `import { jobsServiceFiles } from "./jobs/index.js";`,
    rendererCall: `files.push(...jobsServiceFiles("${mode}"));`,
    serviceBarrelLine: `export * as jobs from "./jobs/index.js";`,
    packageExport: mode === "monorepo" ? { "./jobs": "./src/jobs/index.ts" } : null,
    compositionInstruction:
      "Implement JobPersistencePort with database transactions and compare-and-set writes, then validate it through definePostgresJobsAdapter or defineConvexJobsAdapter.",
  };
}

export { JOBS_CAPABILITY_FRAGMENT } from "./capability.js";
