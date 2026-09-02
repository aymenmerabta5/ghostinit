import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { jobsServiceFiles } from "../../../src/templates/services/jobs/index.js";
import { createJobsHarness, type TestJobRun } from "./jobs-harness.js";
import { expectErrorCode, importRenderedService } from "./runtime.js";

interface JobsService {
  runs: {
    enqueue(
      actor: { userId: string },
      input: {
        jobId: string;
        requestKey: string;
        payload?: Readonly<Record<string, unknown>>;
        maxAttempts?: number;
      },
    ): Promise<{ run: TestJobRun; created: boolean }>;
    get(actor: { userId: string }, runId: string): Promise<TestJobRun>;
    cancel(
      actor: { userId: string },
      runId: string,
    ): Promise<{ run: TestJobRun; changed: boolean }>;
  };
  schedules: {
    materialize(
      scheduleId: string,
      scheduledFor: Date,
    ): Promise<{ run: TestJobRun; created: boolean; scheduleAdvanced: boolean; nextRunAt: Date }>;
    tick(limit?: number): Promise<Array<{ run: TestJobRun }>>;
  };
  workers: {
    claim(worker: { workerId: string }): Promise<TestJobRun | null>;
    heartbeat(
      worker: { workerId: string },
      runId: string,
      leaseToken: string,
    ): Promise<{ run: TestJobRun; cancellationRequested: boolean }>;
    succeed(
      worker: { workerId: string },
      runId: string,
      leaseToken: string,
    ): Promise<{ kind: "updated" | "cancelled" | "cancellation-requested"; run: TestJobRun }>;
    fail(
      worker: { workerId: string },
      input: { runId: string; leaseToken: string; error: string; retryable: boolean },
    ): Promise<{ kind: "updated" | "cancelled" | "cancellation-requested"; run: TestJobRun }>;
    recoverExpiredLeases(
      limit?: number,
    ): Promise<{ examined: number; recovered: TestJobRun[]; raced: number }>;
  };
}

interface JobsServiceModule {
  createJobsService(dependencies: {
    persistence: ReturnType<typeof createJobsHarness>["persistence"];
    scheduleCalculator: ReturnType<typeof createJobsHarness>["scheduleCalculator"];
    leaseTokens: ReturnType<typeof createJobsHarness>["leaseTokens"];
    now: () => Date;
    leaseDurationMs?: number;
    retryPolicy?: { initialDelayMs: number; multiplier: number; maximumDelayMs: number };
  }): JobsService;
}

const start = new Date("2026-04-05T06:07:08.000Z");
let generated: JobsServiceModule;
let runtimeRoot = "";

beforeAll(async () => {
  const loaded = await importRenderedService<JobsServiceModule>(
    "jobs",
    "src/server/services/jobs/",
    jobsServiceFiles("single"),
  );
  generated = loaded.module;
  runtimeRoot = loaded.root;
});

afterAll(() => {
  if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
});

function setup() {
  const harness = createJobsHarness(start);
  const service = generated.createJobsService({
    persistence: harness.persistence,
    scheduleCalculator: harness.scheduleCalculator,
    leaseTokens: harness.leaseTokens,
    now: harness.now,
    leaseDurationMs: 30_000,
    retryPolicy: { initialDelayMs: 1_000, multiplier: 2, maximumDelayMs: 60_000 },
  });
  return { harness, service };
}

describe("generated jobs service behavior", () => {
  test("deduplicates enqueue deterministically and denies cross-user access", async () => {
    const { harness, service } = setup();
    const input = { jobId: "email.digest", requestKey: "request-42", payload: { page: 1 } };
    const first = await service.runs.enqueue({ userId: "user-a" }, input);
    const replay = await service.runs.enqueue({ userId: "user-a" }, input);
    const otherActor = await service.runs.enqueue({ userId: "user-b" }, input);

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.run.id).toBe(first.run.id);
    expect(otherActor.run.id).not.toBe(first.run.id);
    expect(harness.state.runs).toHaveLength(2);

    await expectErrorCode(
      service.runs.enqueue({ userId: "user-a" }, { ...input, payload: { page: 2 } }),
      "JOB_IDEMPOTENCY_CONFLICT",
    );

    await expectErrorCode(
      service.runs.get({ userId: "user-b" }, first.run.id),
      "JOB_RUN_NOT_FOUND",
    );
    await expectErrorCode(
      service.runs.cancel({ userId: "user-b" }, first.run.id),
      "JOB_RUN_NOT_FOUND",
    );
  });

  test("materializes schedules replay-safely even when schedule advancement races", async () => {
    const { harness, service } = setup();
    const first = await service.schedules.materialize("daily-digest", start);
    const replay = await service.schedules.materialize("daily-digest", start);

    expect(first.created).toBe(true);
    expect(first.scheduleAdvanced).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.scheduleAdvanced).toBe(false);
    expect(first.run.idempotencyKey).toBe(replay.run.idempotencyKey);
    expect(harness.state.runs).toHaveLength(1);
  });

  test("allows only one claim winner and rejects work after lease expiry", async () => {
    const { harness, service } = setup();
    await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "claim-race" },
    );
    const claims = await Promise.all([
      service.workers.claim({ workerId: "worker-a" }),
      service.workers.claim({ workerId: "worker-b" }),
    ]);
    const winners = claims.filter((value): value is TestJobRun => value !== null);
    expect(winners).toHaveLength(1);
    const winner = winners[0]!;
    const token = winner.lease!.token;

    harness.setNow(new Date(start.getTime() + 30_001));
    await expectErrorCode(
      service.workers.heartbeat({ workerId: winner.lease!.workerId }, winner.id, token),
      "JOB_LEASE_LOST",
    );
  });

  test("recovers expired work with deterministic backoff and reports heartbeat races", async () => {
    const { harness, service } = setup();
    const first = await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "recover-a" },
    );
    await service.workers.claim({ workerId: "worker-a" });
    const expiredAt = new Date(start.getTime() + 30_001);
    harness.setNow(expiredAt);
    const recovery = await service.workers.recoverExpiredLeases();

    expect(recovery).toMatchObject({ examined: 1, raced: 0 });
    expect(first.run.state).toBe("queued");
    expect(first.run.availableAt).toEqual(new Date(expiredAt.getTime() + 1_000));
    expect(first.run.lastError).toBe("Worker lease expired before completion");

    harness.setNow(first.run.availableAt);
    const reclaimed = await service.workers.claim({ workerId: "worker-b" });
    expect(reclaimed?.attempt).toBe(2);

    const second = await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "recover-race" },
    );
    harness.setNow(new Date(first.run.availableAt.getTime() + 1));
    await service.workers.claim({ workerId: "worker-c" });
    harness.setNow(new Date(harness.now().getTime() + 30_001));
    harness.setBeforeRecover((run) => {
      if (run.id === second.run.id && run.lease) {
        run.lease.expiresAt = new Date(harness.now().getTime() + 30_000);
      }
    });
    const raced = await service.workers.recoverExpiredLeases();
    expect(raced.raced).toBe(1);
    expect(second.run.state).toBe("running");
  });

  test("retries with backoff, then cooperatively cancels without false success", async () => {
    const { harness, service } = setup();
    const enqueued = await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "retry-cancel", maxAttempts: 2 },
    );
    const firstClaim = await service.workers.claim({ workerId: "worker-a" });
    expect(firstClaim?.id).toBe(enqueued.run.id);
    const firstFailure = await service.workers.fail(
      { workerId: "worker-a" },
      {
        runId: enqueued.run.id,
        leaseToken: firstClaim!.lease!.token,
        error: "temporary",
        retryable: true,
      },
    );
    expect(firstFailure.run.state).toBe("queued");
    expect(firstFailure.run.availableAt).toEqual(new Date(start.getTime() + 1_000));

    harness.setNow(firstFailure.run.availableAt);
    const secondClaim = await service.workers.claim({ workerId: "worker-b" });
    const token = secondClaim!.lease!.token;
    const cancellation = await service.runs.cancel({ userId: "user-a" }, enqueued.run.id);
    expect(cancellation.changed).toBe(true);
    expect(cancellation.run.state).toBe("running");

    const heartbeat = await service.workers.heartbeat(
      { workerId: "worker-b" },
      enqueued.run.id,
      token,
    );
    expect(heartbeat.cancellationRequested).toBe(true);
    const completion = await service.workers.succeed(
      { workerId: "worker-b" },
      enqueued.run.id,
      token,
    );
    expect(completion.kind).toBe("cancelled");
    expect(completion.run.state).toBe("cancelled");
  });

  test("lets a cancellation racing crash recovery win atomically", async () => {
    const { harness, service } = setup();
    const enqueued = await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "recovery-cancel-race" },
    );
    await service.workers.claim({ workerId: "worker-a" });
    const recoveredAt = new Date(start.getTime() + 30_001);
    harness.setNow(recoveredAt);
    harness.setBeforeRecover((run) => {
      if (run.id === enqueued.run.id) run.cancellationRequestedAt = recoveredAt;
    });

    const recovery = await service.workers.recoverExpiredLeases();
    expect(recovery).toMatchObject({ examined: 1, raced: 0 });
    expect(recovery.recovered[0]?.state).toBe("cancelled");
    expect(enqueued.run.state).toBe("cancelled");
  });

  test("cancels queued runs idempotently and stops retrying at max attempts", async () => {
    const { service } = setup();
    const queued = await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "queued-cancel" },
    );
    expect((await service.runs.cancel({ userId: "user-a" }, queued.run.id)).changed).toBe(true);
    expect((await service.runs.cancel({ userId: "user-a" }, queued.run.id)).changed).toBe(false);

    const final = await service.runs.enqueue(
      { userId: "user-a" },
      { jobId: "email.digest", requestKey: "final-failure", maxAttempts: 1 },
    );
    const claim = await service.workers.claim({ workerId: "worker-a" });
    expect(claim?.id).toBe(final.run.id);
    const failed = await service.workers.fail(
      { workerId: "worker-a" },
      {
        runId: final.run.id,
        leaseToken: claim!.lease!.token,
        error: "permanent",
        retryable: true,
      },
    );
    expect(failed.run.state).toBe("failed");
    expect(failed.run.finishedAt).toEqual(start);
  });
});
