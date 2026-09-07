import type { ProjectMode } from "../../../lib/addons.js";
import { jobsServiceModule } from "./shared.js";

export function jobsContextContent(mode: ProjectMode): string {
  const serviceModule = jobsServiceModule(mode);
  return `import { JobError } from "${serviceModule}";
import type { JobActor, JobsService } from "${serviceModule}";

export interface JobsTransportContext {
  jobActor?: JobActor | null;
}

export type ResolveJobsService<TContext extends JobsTransportContext> = (
  context: TContext,
) => JobsService | Promise<JobsService>;

export function requireJobActor(context: JobsTransportContext): JobActor {
  if (!context.jobActor) throw new JobError("JOB_UNAUTHENTICATED", "Authentication is required");
  return context.jobActor;
}
`;
}
