export function jobsProceduresContent(): string {
  return `import { implement } from "@orpc/server";
import { createJobActions } from "./actions.js";
import { jobsContract } from "./contract.js";
import type { JobsTransportContext, ResolveJobsService } from "./context.js";

export function createJobProcedures<TContext extends JobsTransportContext>(
  resolveService: ResolveJobsService<TContext>,
) {
  const implementer = implement<typeof jobsContract, TContext>(jobsContract);
  const actions = createJobActions(resolveService);
  return {
    enqueue: implementer.enqueue.handler(actions.enqueue),
    getRun: implementer.getRun.handler(actions.getRun),
    cancelRun: implementer.cancelRun.handler(actions.cancelRun),
  };
}

export type JobProcedures<TContext extends JobsTransportContext> = ReturnType<
  typeof createJobProcedures<TContext>
>;
`;
}
