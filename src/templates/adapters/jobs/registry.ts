export function jobHandlerRegistryContent(): string {
  return `import "server-only";

export interface JobHandlerContext {
  runId: string;
  attempt: number;
  signal: AbortSignal;
  payload: Readonly<Record<string, unknown>>;
}

export type JobHandler = (context: JobHandlerContext) => Promise<unknown>;

/** Add application handlers here. Missing handlers fail the run; they never report success. */
export const jobHandlers = {
  "system.echo": async ({ payload, signal }: JobHandlerContext) => {
    if (signal.aborted) throw new Error("Job execution was cancelled");
    return { echoed: payload };
  },
} satisfies Readonly<Record<string, JobHandler>>;

export const jobDefinitions = Object.freeze(
  Object.keys(jobHandlers).map((id) => ({
    id,
    type: id,
    enabled: true,
    defaultMaxAttempts: 3,
  })),
);

export function getJobHandler(jobId: string): JobHandler {
  if (!Object.hasOwn(jobHandlers, jobId)) throw new Error("No handler is registered for job " + jobId);
  const handler: unknown = Reflect.get(jobHandlers, jobId);
  if (typeof handler !== "function") throw new Error("Invalid handler registration for job " + jobId);
  return handler as JobHandler;
}
`;
}
