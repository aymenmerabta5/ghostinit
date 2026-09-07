import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jobsAdapterFiles } from "../../src/templates/adapters/jobs/index.js";
import { jobProcessLifecycleContent } from "../../src/templates/adapters/jobs/lifecycle.js";
import { postgresJobSchedulerContent } from "../../src/templates/adapters/jobs/scheduler.js";
import { postgresJobWorkerContent } from "../../src/templates/adapters/jobs/worker.js";

interface JobProcessLifecycle {
  interruptibleSleep(milliseconds: number, signal: AbortSignal): Promise<void>;
  linkAbortSignal(source: AbortSignal, destination: AbortController): () => void;
}

class TrackedAbortSignal {
  aborted = false;
  readonly listeners = new Set<() => void>();

  addEventListener(type: string, listener: () => void): void {
    if (type === "abort") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    if (type === "abort") this.listeners.delete(listener);
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    for (const listener of this.listeners) listener();
  }
}

let lifecycle: JobProcessLifecycle;
let runtimeRoot = "";

beforeAll(async () => {
  runtimeRoot = mkdtempSync(join(tmpdir(), "ghostinit-jobs-lifecycle-"));
  const path = join(runtimeRoot, "lifecycle.ts");
  writeFileSync(path, jobProcessLifecycleContent(), "utf8");
  lifecycle = (await import(pathToFileURL(path).href)) as JobProcessLifecycle;
});

afterAll(() => {
  if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
});

describe("generated jobs process shutdown", () => {
  test("polling sleep releases its abort listener after every normal interval", async () => {
    const signal = new TrackedAbortSignal();
    for (let index = 0; index < 5; index += 1) {
      await lifecycle.interruptibleSleep(1, signal as unknown as AbortSignal);
      expect(signal.listeners.size).toBe(0);
    }
  });

  test("scheduler sleep wakes immediately on shutdown and cleans its listener", async () => {
    const signal = new TrackedAbortSignal();
    const sleeping = lifecycle.interruptibleSleep(250, signal as unknown as AbortSignal);
    expect(signal.listeners.size).toBe(1);

    signal.abort();
    await sleeping;

    expect(signal.listeners.size).toBe(0);
  });

  test("active job execution receives process shutdown with deterministic cleanup", () => {
    const source = new TrackedAbortSignal();
    const execution = new AbortController();
    const unlink = lifecycle.linkAbortSignal(source as unknown as AbortSignal, execution);

    expect(source.listeners.size).toBe(1);
    source.abort();
    expect(execution.signal.aborted).toBe(true);
    unlink();
    expect(source.listeners.size).toBe(0);
  });

  test("worker links active execution, avoids post-shutdown claims, and removes signal hooks", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const source = postgresJobWorkerContent(mode);
      const shutdownGuard = source.indexOf("if (signal.aborted) break;");
      const claim = source.indexOf("await jobs.workers.claim({ workerId })");

      expect(source).toContain("linkAbortSignal(shutdownSignal, execution)");
      expect(source.match(/assertWorkerRunning\(shutdownSignal\)/g) ?? []).toHaveLength(3);
      expect(source).toContain("Never commit such a partial result during process shutdown");
      expect(source).toContain("await execute(run, signal)");
      expect(source).toContain("unlinkShutdown();");
      expect(source).toContain('process.removeListener("SIGINT", requestShutdown)');
      expect(source).toContain('process.removeListener("SIGTERM", requestShutdown)');
      expect(source).not.toContain("async function sleep(");
      expect(shutdownGuard).toBeGreaterThan(-1);
      expect(shutdownGuard).toBeLessThan(claim);
    }
  });

  test("scheduler uses the same interruptible cross-runtime shutdown primitive", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const source = postgresJobSchedulerContent(mode);
      expect(source).toContain("export async function runJobScheduler(signal: AbortSignal)");
      expect(source).toContain("while (!signal.aborted)");
      expect(source).toContain("await interruptibleSleep(tickMs, signal)");
      expect(source).toContain('process.removeListener("SIGINT", requestShutdown)');
      expect(source).toContain('process.removeListener("SIGTERM", requestShutdown)');
      expect(source).not.toContain("let stopped = false");
      expect(source).not.toContain("new Promise((resolve) => setTimeout(resolve, tickMs))");
    }
  });

  test("emits the shared lifecycle module in every PostgreSQL jobs layout", () => {
    const layouts = [
      { mode: "single", userFacingApi: true, path: "src/server/workers/jobs/lifecycle.ts" },
      {
        mode: "monorepo",
        userFacingApi: true,
        path: "packages/api/src/workers/jobs/lifecycle.ts",
      },
      {
        mode: "monorepo",
        userFacingApi: false,
        path: "packages/jobs-runtime/src/workers/jobs/lifecycle.ts",
      },
    ] as const;

    for (const layout of layouts) {
      const paths = jobsAdapterFiles({
        mode: layout.mode,
        database: "postgres",
        userFacingApi: layout.userFacingApi,
      }).map(({ path }) => path);
      expect(paths).toContain(layout.path);
    }
  });
});
