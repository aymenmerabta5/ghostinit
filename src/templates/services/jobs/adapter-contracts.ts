import { jobsServerOnly } from "./shared.js";

export function jobsAdapterContractsContent(): string {
  return `${jobsServerOnly}
import type { JobPersistencePort } from "./ports.js";

export interface PostgresJobsAdapter extends JobPersistencePort {
  readonly kind: "postgres";
}

export interface ConvexJobsAdapter extends JobPersistencePort {
  readonly kind: "convex";
}

export type SupportedJobsAdapter = PostgresJobsAdapter | ConvexJobsAdapter;

export function definePostgresJobsAdapter<T extends PostgresJobsAdapter>(adapter: T): T {
  return adapter;
}

export function defineConvexJobsAdapter<T extends ConvexJobsAdapter>(adapter: T): T {
  return adapter;
}

export type JobsAdapterParity =
  Exclude<keyof PostgresJobsAdapter, "kind"> extends Exclude<keyof ConvexJobsAdapter, "kind">
    ? Exclude<keyof ConvexJobsAdapter, "kind"> extends Exclude<keyof PostgresJobsAdapter, "kind">
      ? true
      : never
    : never;
`;
}
