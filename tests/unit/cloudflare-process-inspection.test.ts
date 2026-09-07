import { describe, expect, test } from "bun:test";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { cloudflareProcessHelpers } from "../../src/templates/root/cloudflare-process.js";
import { runWindowsQueryFixture } from "../helpers/cloudflare-process-query-fixture.js";
import { testEnvironment } from "../helpers/cloudflare-runtime-fixture.js";
import { resolveWindowsSystemExecutable } from "../helpers/process-tree.js";

interface ProcessRecord {
  pid: number;
  parentPid: number;
  createdAt: string;
}

interface OwnedChild {
  pid: number;
  exitCode: number | null;
  signalCode: null;
}

interface Protocol {
  table(deadline?: number): Promise<ProcessRecord[]>;
  capture(child: OwnedChild): Promise<{ records: ProcessRecord[]; live: ProcessRecord[] }>;
  terminate(child: OwnedChild, completion: Promise<unknown>): Promise<void>;
}

class Inspection extends EventEmitter {
  readonly pid = 4_000;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    this.emit("close", null, signal);
    return true;
  }

  complete(records: ProcessRecord[]): void {
    this.stdout.emit("data", Buffer.from(JSON.stringify(records)));
    this.emit("close", 0, null);
  }
}

function protocol(
  spawnInspection: (command: string, args: string[], options: SpawnOptions) => unknown,
  executable: () => string = () => "fixture-powershell",
  overrides: {
    now?: () => number;
    spawnSync?: (command: string, args: string[], options: SpawnOptions) => unknown;
  } = {},
): Protocol {
  return new Function(
    "process",
    "spawn",
    "spawnSync",
    "Buffer",
    "executable",
    "Date",
    `${cloudflareProcessHelpers()}
windowsSystemExecutable = executable;
return { table: windowsProcessTable, capture: captureProcessTree, terminate: terminateSupervisedProcessTree };`,
  )(
    { platform: "win32", env: {} },
    spawnInspection,
    overrides.spawnSync ??
      (() => {
        throw new Error("Unexpected synchronous command");
      }),
    Buffer,
    executable,
    overrides.now ? { now: overrides.now, parse: Date.parse } : Date,
  ) as Protocol;
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
const record = { pid: 123, parentPid: 1, createdAt: "2026-09-07T00:00:00.000Z" };

describe("generated Windows process inspection", () => {
  test("joins close rather than reporting success at process exit", async () => {
    const query = new Inspection();
    const api = protocol(() => query);
    let settled = false;
    const pending = api.table().then((value) => {
      settled = true;
      return value;
    });
    await nextTurn();
    query.stdout.emit("data", Buffer.from(JSON.stringify([record])));
    query.emit("exit", 0, null);
    await nextTurn();
    expect(settled).toBe(false);
    query.emit("close", 0, null);
    expect(await pending).toEqual([record]);
  }, 5_000);

  test("serializes inspections and resumes the queue after failure", async () => {
    const queries: Inspection[] = [];
    const api = protocol(() => {
      const query = new Inspection();
      queries.push(query);
      return query;
    });
    const first = api.table().catch((error: Error) => error);
    const second = api.table();
    await nextTurn();
    expect(queries).toHaveLength(1);
    queries[0]!.emit("close", 1, null);
    const firstFailure = await first;
    expect(firstFailure).toBeInstanceOf(Error);
    expect((firstFailure as Error).message).toContain("Could not verify");
    await nextTurn();
    expect(queries).toHaveLength(2);
    queries[1]!.complete([record]);
    expect(await second).toEqual([record]);
  }, 5_000);

  test("does not adopt a reused root PID after the owned child exits during discovery", async () => {
    const query = new Inspection();
    const api = protocol(() => query);
    const child: OwnedChild = { pid: record.pid, exitCode: null, signalCode: null };
    const pending = api.capture(child);
    await nextTurn();
    child.exitCode = 0;
    query.complete([record]);
    expect((await pending).records).toEqual([]);
  }, 5_000);

  test("initial uncertain descendants remain unsafe after their parent disappears", async () => {
    const queries: Inspection[] = [];
    let signals = 0;
    const api = protocol(
      () => {
        const query = new Inspection();
        queries.push(query);
        return query;
      },
      undefined,
      {
        spawnSync: () => {
          signals += 1;
          throw new Error("Unsafe PID-only signal");
        },
      },
    );
    const child: OwnedChild = { pid: 123, exitCode: null, signalCode: null };
    const initial = api.capture(child).catch((error: Error) => error);
    await nextTurn();
    child.exitCode = 0;
    queries[0]!.complete([{ pid: 124, parentPid: 123, createdAt: record.createdAt }]);
    expect(((await initial) as Error).message).toContain("unverified descendants");
    const cleanup = api.terminate(child, Promise.resolve()).catch((error: Error) => error);
    await nextTurn();
    // B exited after spawning C; a later C -> B snapshot cannot erase the earlier uncertainty.
    queries[1]?.complete([{ pid: 125, parentPid: 124, createdAt: record.createdAt }]);
    expect(await cleanup).toBeInstanceOf(Error);
    expect(queries).toHaveLength(1);
    expect(signals).toBe(0);
  }, 5_000);

  test("termination queued during initial discovery cannot bypass later uncertainty", async () => {
    const queries: Inspection[] = [];
    let signals = 0;
    const api = protocol(
      () => {
        const query = new Inspection();
        queries.push(query);
        return query;
      },
      undefined,
      {
        spawnSync: () => {
          signals += 1;
          throw new Error("Unsafe PID-only signal");
        },
      },
    );
    const child: OwnedChild = { pid: 123, exitCode: null, signalCode: null };
    const initial = api.capture(child).catch((error: Error) => error);
    await nextTurn();
    const cleanup = api.terminate(child, Promise.resolve()).catch((error: Error) => error);
    await nextTurn();
    expect(queries).toHaveLength(1);
    child.exitCode = 0;
    queries[0]!.complete([{ pid: 124, parentPid: 123, createdAt: record.createdAt }]);
    expect(await initial).toBeInstanceOf(Error);
    await nextTurn();
    expect(queries).toHaveLength(2);
    queries[1]!.complete([{ pid: 125, parentPid: 124, createdAt: record.createdAt }]);
    const failure = await cleanup;
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("Unverified Windows descendant evidence");
    expect(signals).toBe(0);
  }, 5_000);

  test("late empty inspection cannot certify cleanup beyond its total deadline", async () => {
    let clock = 0;
    const child: OwnedChild = { pid: 123, exitCode: null, signalCode: null };
    const queries: Inspection[] = [];
    const timeouts: number[] = [];
    const waiters = new Map<number, (query: Inspection) => void>();
    const queryAt = (index: number): Promise<Inspection> =>
      queries[index]
        ? Promise.resolve(queries[index])
        : new Promise((resolve) => waiters.set(index, resolve));
    const api = protocol(
      (_command, _args, options) => {
        const query = new Inspection();
        const index = queries.length;
        queries.push(query);
        timeouts.push(options.timeout!);
        waiters.get(index)?.(query);
        return query;
      },
      undefined,
      {
        now: () => clock,
        spawnSync: (_command, _args, options) => {
          expect(options.timeout).toBe(10_000);
          clock += 9_000;
          child.exitCode = 0;
          return { status: 0, signal: null };
        },
      },
    );
    const pending = api.terminate(child, Promise.resolve()).catch((error: Error) => error);
    const first = await queryAt(0);
    clock = 9_000;
    first.complete([record]);
    const second = await queryAt(1);
    clock = 27_000;
    second.complete([]);
    const third = await queryAt(2);
    expect(timeouts[2]).toBeLessThanOrEqual(3_000);
    clock = 36_050;
    third.complete([]);
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("bounded deadline");
  }, 5_000);

  test("queued discovery expires without launching a process after its deadline", async () => {
    const queries: Inspection[] = [];
    const api = protocol(() => {
      const query = new Inspection();
      queries.push(query);
      return query;
    });
    const first = api.table();
    const queued = api.table(Date.now() + 20).catch((error: Error) => error);
    expect(((await queued) as Error).message).toContain("bounded deadline");
    expect(queries).toHaveLength(1);
    queries[0]!.complete([]);
    await first;
    await nextTurn();
    expect(queries).toHaveLength(1);
  }, 5_000);

  test("retains creation-time fencing for observed descendants", async () => {
    const query = new Inspection();
    const api = protocol(() => query);
    const child: OwnedChild = { pid: record.pid, exitCode: null, signalCode: null };
    const pending = api.capture(child);
    await nextTurn();
    const descendant = { pid: 124, parentPid: record.pid, createdAt: "2026-09-07T00:00:01.000Z" };
    query.complete([record, descendant]);
    expect((await pending).records).toEqual([record, descendant]);
  }, 5_000);

  test("bounds output and reports metadata without disclosing stderr", async () => {
    const query = new Inspection();
    const api = protocol(() => query);
    const pending = api.table().catch((error: Error) => error);
    await nextTurn();
    query.stderr.emit("data", Buffer.from("fixture-private-canary"));
    const chunk = Buffer.alloc(8 * 1024 * 1024);
    query.stdout.emit("data", chunk);
    query.stdout.emit("data", chunk);
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('"exceeded":true');
    expect((error as Error).message).not.toContain("fixture-private-canary");
    expect(query.signals).toEqual(["SIGKILL"]);
  }, 5_000);

  test("rejects incomplete JSON and invalid process identities", async () => {
    for (const value of ["[", JSON.stringify([{ ...record, createdAt: "invalid" }])]) {
      const query = new Inspection();
      const api = protocol(() => query);
      const pending = api.table().catch((error: Error) => error);
      await nextTurn();
      query.stdout.emit("data", Buffer.from(value));
      query.emit("close", 0, null);
      const failure = await pending;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/not valid JSON|invalid identity/);
    }
  }, 5_000);

  test("native subprocess timeout is joined before inspection reports failure", async () => {
    let query: ChildProcess | undefined;
    const api = protocol((_command, _args, options) => {
      query = spawn(process.execPath, ["--smol", "-e", "setInterval(() => {}, 1000)"], {
        ...options,
        timeout: 25,
      });
      return query;
    });
    const error = await api.table().catch((failure: Error) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(query).toBeDefined();
    expect(query!.exitCode !== null || query!.signalCode !== null).toBe(true);
  }, 5_000);

  test.skipIf(process.platform !== "win32")(
    "reads real identities from a wrapper with the filtered fixture environment",
    () => {
      const environment = testEnvironment();
      const result = runWindowsQueryFixture(environment, true);
      console.info("Windows first-call process discovery: " + JSON.stringify(result));
      if (result.status !== 0 || !result.report?.success || !result.report.ownIdentity) {
        const runnerModuleCache = process.env.PSModuleAnalysisCachePath;
        const diagnostics = {
          filtered: result,
          filteredStages: runWindowsQueryFixture(testEnvironment(), true),
          runnerModuleCacheConfigured: runnerModuleCache !== undefined,
          filteredWithRunnerModuleCache:
            runnerModuleCache === undefined
              ? null
              : runWindowsQueryFixture(
                  testEnvironment({ PSModuleAnalysisCachePath: runnerModuleCache }),
                ),
          fullEnvironment: runWindowsQueryFixture({ ...process.env }, true),
        };
        console.error("Windows query fixture diagnostics: " + JSON.stringify(diagnostics));
      }
      expect(environment.PSModuleAnalysisCachePath).toBe(process.env.PSModuleAnalysisCachePath);
      expect(result.status).toBe(0);
      expect(result.report?.success).toBe(true);
      expect(result.report?.ownIdentity).toBe(true);
      expect(result.report?.nativeClosed).toBe(true);
    },
    60_000,
  );

  test.skipIf(process.platform !== "win32")(
    "reads real Windows identities through the bounded native query",
    async () => {
      const api = protocol(spawn, () => resolveWindowsSystemExecutable("powershell"));
      const rows = await api.table();
      expect(rows.some(({ pid }) => pid === process.pid)).toBe(true);
      expect(rows.every(({ createdAt }) => Number.isFinite(Date.parse(createdAt)))).toBe(true);
    },
    20_000,
  );
});
