export function convexJobCronsContent(): string {
  return `import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Convex deploy registers this schedule. It materializes durable schedule rows;
// individual job actions are enqueued only by the internal transactional tick.
crons.interval("ensure job definitions", { minutes: 1 }, internal.jobsInternal.ensureDefinitions, {});
crons.interval("materialize due jobs", { minutes: 1 }, internal.jobsInternal.tickSchedules, { limit: 100 });
crons.interval("recover expired job leases", { minutes: 1 }, internal.jobsInternal.recoverExpired, { limit: 500 });

export default crons;
`;
}
