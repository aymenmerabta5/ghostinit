export const JOBS_CAPABILITY_FRAGMENT = Object.freeze({
  id: "jobs",
  description: "Persistent schedules and replay-safe job runs with leased worker execution.",
  requirements: Object.freeze([
    Object.freeze({ kind: "capability", capability: "auth" }),
    Object.freeze({ kind: "capability", capability: "transport" }),
    Object.freeze({ kind: "backend" }),
    Object.freeze({ kind: "persistence" }),
    Object.freeze({
      kind: "target-binding",
      subject: "backend-host",
      targets: Object.freeze(["nextjs", "tanstack-start"]),
    }),
  ]),
  acceptanceOperationIds: Object.freeze([
    "jobs.runs.enqueue-idempotent",
    "jobs.runs.read-owned",
    "jobs.runs.cancel",
    "jobs.schedules.materialize-idempotent",
    "jobs.workers.claim-exclusive",
    "jobs.workers.heartbeat-lease",
    "jobs.workers.retry-backoff",
    "jobs.workers.cancel-cooperative",
    "jobs.workers.recover-expired-lease",
    "jobs.adapters.postgres-convex-parity",
  ]),
} as const);
