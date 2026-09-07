import type { ProjectMode } from "../../../lib/addons.js";

export function postgresJobWorkerContent(mode: ProjectMode): string {
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "../../services/jobs";
  const adapterImport =
    mode === "monorepo" ? "../../adapters/jobs/postgres" : "../../adapters/jobs/postgres";
  const calculatorImport =
    mode === "monorepo"
      ? "../../adapters/jobs/schedule-calculator"
      : "../../adapters/jobs/schedule-calculator";
  return `// @allow-long 330: worker lifecycle, heartbeat, cancellation, recovery, and result commit
import "server-only";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { createJobsService } from "${serviceImport}";
import { postgresJobsAdapter } from "${adapterImport}";
import { cronJobScheduleCalculator } from "${calculatorImport}";
import { interruptibleSleep, linkAbortSignal } from "./lifecycle";
import { getJobHandler, jobDefinitions } from "./registry";

const workerId = process.env.JOB_WORKER_ID?.trim() || [hostname(), process.pid, randomBytes(6).toString("hex")].join(":");
const pollMs = boundedInteger(process.env.JOB_WORKER_POLL_MS, 250, 60_000, 1_000);
const heartbeatMs = boundedInteger(process.env.JOB_HEARTBEAT_MS, 1_000, 60_000, 10_000);
const leaseMs = boundedInteger(process.env.JOB_LEASE_MS, heartbeatMs * 2 + 1, 15 * 60_000, 30_000);

function boundedInteger(source: string | undefined, minimum: number, maximum: number, fallback: number): number {
  const value = source === undefined ? fallback : Number(source);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error("Job worker timing configuration is outside safe bounds");
  }
  return value;
}

function log(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
  console.info(JSON.stringify({ scope: "job-worker", event, workerId, at: new Date().toISOString(), ...fields }));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown job execution failure";
}

function assertWorkerRunning(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Job worker shutdown requested during execution");
}

const jobs = createJobsService({
  persistence: postgresJobsAdapter,
  scheduleCalculator: cronJobScheduleCalculator,
  leaseTokens: { create: () => randomBytes(32).toString("base64url") },
  leaseDurationMs: leaseMs,
});

async function execute(
  run: NonNullable<Awaited<ReturnType<typeof jobs.workers.claim>>>,
  shutdownSignal: AbortSignal,
): Promise<void> {
  const lease = run.lease;
  if (!lease) throw new Error("Claimed job did not contain a lease");
  const execution = new AbortController();
  const unlinkShutdown = linkAbortSignal(shutdownSignal, execution);
  let heartbeatChain = Promise.resolve();
  let heartbeatFailure: unknown;
  const timer = setInterval(() => {
    heartbeatChain = heartbeatChain.then(async () => {
      const heartbeat = await jobs.workers.heartbeat({ workerId }, run.id, lease.token);
      if (heartbeat.cancellationRequested) execution.abort();
    }).catch((error: unknown) => {
      heartbeatFailure = error;
      execution.abort();
    });
  }, heartbeatMs);
  try {
    assertWorkerRunning(shutdownSignal);
    const result = await getJobHandler(run.jobId)({
      runId: run.id,
      attempt: run.attempt,
      signal: execution.signal,
      payload: run.payload,
    });
    // A cooperative handler may return after observing abort instead of throwing.
    // Never commit such a partial result during process shutdown.
    assertWorkerRunning(shutdownSignal);
    clearInterval(timer);
    await heartbeatChain;
    if (heartbeatFailure) throw heartbeatFailure;
    const finalHeartbeat = await jobs.workers.heartbeat({ workerId }, run.id, lease.token);
    assertWorkerRunning(shutdownSignal);
    if (finalHeartbeat.cancellationRequested) {
      await jobs.workers.acknowledgeCancellation({ workerId }, run.id, lease.token);
      log("cancelled", { runId: run.id, attempt: run.attempt });
      return;
    }
    const completed = await postgresJobsAdapter.completeRunWithResult({
      runId: run.id,
      workerId,
      leaseToken: lease.token,
      completedAt: new Date(),
      result,
    });
    if (!completed) throw new Error("Job lease was lost before result commit");
    log("succeeded", { runId: run.id, attempt: run.attempt });
  } catch (error) {
    clearInterval(timer);
    await heartbeatChain;
    try {
      const settled = await jobs.workers.fail(
        { workerId },
        { runId: run.id, leaseToken: lease.token, error: message(error), retryable: true },
      );
      log(settled.run.state === "queued" ? "retry-scheduled" : settled.run.state, {
        runId: run.id,
        attempt: run.attempt,
        error: message(error),
      });
    } catch (settleError) {
      log("lease-lost", { runId: run.id, error: message(settleError) });
    }
  } finally {
    clearInterval(timer);
    unlinkShutdown();
  }
}

export async function runJobWorker(signal: AbortSignal): Promise<void> {
  await postgresJobsAdapter.ensureDefinitions(jobDefinitions);
  const recovery = await jobs.workers.recoverExpiredLeases();
  log("started", { recovered: recovery.recovered.length, raced: recovery.raced });
  let lastRecovery = Date.now();
  while (!signal.aborted) {
    if (Date.now() - lastRecovery >= 60_000) {
      const result = await jobs.workers.recoverExpiredLeases();
      log("recovery", { examined: result.examined, recovered: result.recovered.length, raced: result.raced });
      lastRecovery = Date.now();
    }
    if (signal.aborted) break;
    const run = await jobs.workers.claim({ workerId });
    if (run) await execute(run, signal);
    else await interruptibleSleep(pollMs, signal);
  }
  log("stopped");
}

const shutdown = new AbortController();
const requestShutdown = () => shutdown.abort();
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);
try {
  await runJobWorker(shutdown.signal);
} finally {
  process.removeListener("SIGINT", requestShutdown);
  process.removeListener("SIGTERM", requestShutdown);
}
`;
}
