import type { ProjectMode } from "../../../lib/addons.js";

export function postgresJobSchedulerContent(mode: ProjectMode): string {
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "../../services/jobs";
  const adapterImport =
    mode === "monorepo" ? "../../adapters/jobs/postgres" : "../../adapters/jobs/postgres";
  const calculatorImport =
    mode === "monorepo"
      ? "../../adapters/jobs/schedule-calculator"
      : "../../adapters/jobs/schedule-calculator";
  return `import "server-only";
import { randomBytes } from "node:crypto";
import { createJobsService } from "${serviceImport}";
import { postgresJobsAdapter } from "${adapterImport}";
import { cronJobScheduleCalculator } from "${calculatorImport}";
import { jobDefinitions } from "./registry";
import { interruptibleSleep } from "./lifecycle";

const jobs = createJobsService({
  persistence: postgresJobsAdapter,
  scheduleCalculator: cronJobScheduleCalculator,
  leaseTokens: { create: () => randomBytes(32).toString("base64url") },
});
const tickMs = Number(process.env.JOB_SCHEDULER_TICK_MS ?? "30000");
if (!Number.isInteger(tickMs) || tickMs < 1_000 || tickMs > 300_000) {
  throw new Error("JOB_SCHEDULER_TICK_MS is outside safe bounds");
}

export async function runJobScheduler(signal: AbortSignal): Promise<void> {
  await postgresJobsAdapter.ensureDefinitions(jobDefinitions);
  while (!signal.aborted) {
    const materialized = await jobs.schedules.tick(100);
    console.info(JSON.stringify({
      scope: "job-scheduler",
      event: "tick",
      materialized: materialized.filter(({ created }) => created).length,
      replayed: materialized.filter(({ created }) => !created).length,
      at: new Date().toISOString(),
    }));
    await interruptibleSleep(tickMs, signal);
  }
}

const shutdown = new AbortController();
const requestShutdown = () => shutdown.abort();
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
try {
  await runJobScheduler(shutdown.signal);
} finally {
  process.removeListener("SIGINT", requestShutdown);
  process.removeListener("SIGTERM", requestShutdown);
}
`;
}
