// @allow-long 332: cross-runtime supervisor containment and assignment-failure regressions share fixtures
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";
import {
  jobsAdapterIntegrationGuide,
  jobsAdapterFiles,
} from "../../src/templates/adapters/jobs/index.js";
import {
  nodeTypeScriptWorkerLoaderContent,
  startPostgresJobsSupervisorContent,
} from "../../src/templates/adapters/jobs/scripts.js";
import { productionProcessSupervisorContent } from "../../src/templates/root/process-supervisor.js";

interface FixtureState {
  runtime: "bun" | "node";
  role: "worker" | "scheduler";
  rootPid: number;
  descendantPid: number;
}

const roots: string[] = [];
const ownedPids = new Set<number>();

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function numericConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`const ${name} = ([\\d_]+);`));
  if (!match?.[1]) throw new Error(`Missing numeric constant ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

function forceKillOwnedTree(pid: number): void {
  if (!processExists(pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

afterAll(() => {
  for (const pid of ownedPids) forceKillOwnedTree(pid);
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function writeRuntimeFixture(
  runtime: "bun" | "node",
  exitingRole: "worker" | "scheduler",
): {
  root: string;
  statePaths: Record<"worker" | "scheduler", string>;
  supervisorPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), `ghostinit-jobs-${runtime}-`));
  roots.push(root);
  const statePaths = {
    worker: join(root, "worker-state.json"),
    scheduler: join(root, "scheduler-state.json"),
  };
  const supervisorPath = join(root, "scripts", "start-jobs.mjs");
  const workerRoot = join(root, "src", "server", "workers", "jobs");
  for (const path of [supervisorPath, join(workerRoot, "worker.ts")]) {
    mkdirSync(dirname(path), { recursive: true });
  }
  writeFileSync(supervisorPath, startPostgresJobsSupervisorContent("single"));
  writeFileSync(
    join(root, "scripts", "typescript-worker-loader.mjs"),
    nodeTypeScriptWorkerLoaderContent(),
  );
  for (const role of ["worker", "scheduler"] as const) {
    const peer = role === "worker" ? "scheduler" : "worker";
    const lifecycle =
      role === exitingRole
        ? `while (!existsSync(process.env.JOBS_TEST_${peer.toUpperCase()}_STATE)) {
  await new Promise((resolve) => setTimeout(resolve, 25));
}
await new Promise((resolve) => setTimeout(resolve, 100));
process.exit(23);`
        : "setInterval(() => {}, 1000);";
    writeFileSync(
      join(workerRoot, `${role}.ts`),
      `import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  detached: true,
  env: process.env,
  stdio: "ignore",
  windowsHide: true,
});
if (descendant.pid === undefined) throw new Error("Fixture descendant did not start");
descendant.unref();
writeFileSync(process.env.JOBS_TEST_${role.toUpperCase()}_STATE, JSON.stringify({
  runtime: typeof Bun === "undefined" ? "node" : "bun",
  role: ${JSON.stringify(role)},
  rootPid: process.pid,
  descendantPid: descendant.pid,
}));
${lifecycle}
`,
    );
  }
  return { root, statePaths, supervisorPath };
}

describe("generated jobs supervisor portability", () => {
  test("emits shell-free package commands for Bun/Node and direct Convex deployment", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const runtime of ["bun", "node"] as const) {
        const scripts = jobsAdapterIntegrationGuide({
          mode,
          database: "postgres",
          runtime,
        }).packageScripts;
        expect(scripts["jobs:start"]).toBe(`bun scripts/start-jobs.mjs --runtime=${runtime}`);
        expect(scripts["jobs:start"]).not.toMatch(/\bbash\b|\bsh\b/);
      }
      expect(
        jobsAdapterIntegrationGuide({ mode, database: "convex" }).packageScripts["jobs:deploy"],
      ).toBe("bun x --no-install convex deploy");
    }

    const postgresPaths = jobsAdapterFiles({ mode: "single", database: "postgres" }).map(
      ({ path }) => path,
    );
    const convexPaths = jobsAdapterFiles({ mode: "single", database: "convex" }).map(
      ({ path }) => path,
    );
    expect(postgresPaths).toContain("scripts/start-jobs.mjs");
    expect(postgresPaths.some((path) => path.endsWith(".sh"))).toBe(false);
    expect(convexPaths.some((path) => path.endsWith(".sh"))).toBe(false);
  });

  test("uses Bun SSOT plus scoped POSIX groups and pre-execution Windows Job admission", () => {
    const source = startPostgresJobsSupervisorContent("single");
    const deploymentSource = productionProcessSupervisorContent(["jobs:start"]);
    expect(source).toContain(`const EXPECTED_BUN_VERSION = "${toolchainRuntime.bun}"`);
    expect(source).toContain("Bun.version !== EXPECTED_BUN_VERSION");
    expect(source).toContain('detached: process.platform !== "win32"');
    expect(source).toContain("process.kill(-groupPid, signal)");
    expect(source).not.toMatch(/process\.kill\([^,]+,\s*0\)/);
    expect(source).toContain('signalProcessGroup(pid, "SIGKILL")');
    expect(source).toContain('const SCOPE_ENV = "GHOSTINIT_JOBS_PROCESS_SCOPE_ID"');
    expect(source).toContain('readdirSync("/proc"');
    expect(source).toContain('spawnSync("/bin/ps"');
    expect(source).toContain('await import("bun:ffi")');
    expect(source).toContain('CreateJobObjectW: { args: ["ptr", "ptr"], returns: "u64" }');
    expect(source).toContain(
      'SetInformationJobObject: { args: ["u64", "u32", "ptr", "u32"], returns: "i32" }',
    );
    expect(source).toContain('OpenProcess: { args: ["u32", "i32", "u32"], returns: "u64" }');
    expect(source).toContain('AssignProcessToJobObject: { args: ["u64", "u64"], returns: "i32" }');
    expect(source).toContain('TerminateJobObject: { args: ["u64", "u32"], returns: "i32" }');
    expect(source).toMatch(
      /QueryInformationJobObject:\s*{\s*args: \["u64", "u32", "ptr", "u32", "ptr"\],\s*returns: "i32"/,
    );
    expect(source).toContain('CloseHandle: { args: ["u64"], returns: "i32" }');
    expect(source).toContain('GetLastError: { args: [], returns: "u32" }');
    expect(source).toContain("OpenProcess(0x00000101, 0, pid)");
    expect(source).toContain("AssignProcessToJobObject(handle, processHandle) === 0");
    expect(source).toContain("TerminateJobObject(handle, 1) === 0");
    expect(source).not.toContain('args: ["u32", "bool", "u32"]');
    expect(source).not.toContain('returns: "bool"');
    expect(source).toContain("kernel.symbols.CloseHandle(handle) === 0");
    expect(source).toContain("const closure = await Promise.allSettled");
    expect(source).toContain("return [...termination, ...closure, ...reaping]");
    expect(source).toContain("AssignProcessToJobObject");
    expect(source).toContain("TerminateJobObject");
    const admissionWait = source.indexOf("await waitForWindowsJobAdmission();");
    const workloadSpawn = source.indexOf("const child = spawn(command.executable", admissionWait);
    const recorded = source.indexOf("children.push(managed);", workloadSpawn);
    const assignment = source.indexOf(
      "await assignWindowsLauncherOrReap(windowsJob, managed);",
      recorded,
    );
    const admission = source.indexOf("children.map(admitWindowsLauncher)");
    expect(admissionWait).toBeGreaterThan(-1);
    expect(workloadSpawn).toBeGreaterThan(admissionWait);
    expect(recorded).toBeGreaterThan(workloadSpawn);
    expect(assignment).toBeGreaterThan(recorded);
    expect(admission).toBeGreaterThan(assignment);
    expect(source).toContain('managed.child.kill("SIGKILL")');
    expect(source).toContain("await waitForChildExit(managed.child, forcedShutdownMs)");
    expect(
      numericConstant(source, "gracefulShutdownMs") + numericConstant(source, "forcedShutdownMs"),
    ).toBeLessThan(numericConstant(deploymentSource, "GRACE_MS"));
    expect(numericConstant(source, "forcedShutdownMs")).toBe(
      numericConstant(deploymentSource, "FORCED_MS"),
    );
    expect(source).toContain("shell: false");
    expect(source).toContain('"SIGHUP"');
    expect(source).toContain('"SIGBREAK"');
    expect(source).not.toMatch(/#!\/usr\/bin\/env bash|command -v|\$!/);
  });

  test.skipIf(process.platform !== "win32")(
    "reaps Windows jobs launchers before aggregating assignment and Job-close failures",
    () => {
      const fixture = writeRuntimeFixture("bun", "worker");
      const launcherPidPath = join(fixture.root, "unassigned-launcher.pid");
      const importNeedle = 'import { readdirSync, readFileSync } from "node:fs";';
      const childrenNeedle = "const children = [];";
      const assignmentNeedle = "    await assignWindowsLauncherOrReap(windowsJob, managed);";
      const closeNeedle = "kernel.symbols.CloseHandle(handle) === 0";
      const libraryCloseNeedle = `try {
        kernel.close();
      } catch (error) {`;
      let source = startPostgresJobsSupervisorContent("single");
      expect(source).toContain(importNeedle);
      expect(source).toContain(childrenNeedle);
      expect(source).toContain(assignmentNeedle);
      expect(source).toContain(closeNeedle);
      expect(source).toContain(libraryCloseNeedle);
      source = source
        .replace(
          importNeedle,
          'import { readdirSync, readFileSync, writeFileSync } from "node:fs";',
        )
        .replace(childrenNeedle, `${childrenNeedle}\nlet assignmentAttempt = 0;`)
        .replace(closeNeedle, `(kernel.symbols.CloseHandle(handle), 0) === 0`)
        .replace(
          libraryCloseNeedle,
          `try {
        throw new Error("injected Windows jobs FFI library close failure");
      } catch (error) {`,
        )
        .replace(
          assignmentNeedle,
          `    assignmentAttempt += 1;
    writeFileSync(${JSON.stringify(launcherPidPath)}, String(managed.child.pid) + "\\n", { flag: "a" });
    await assignWindowsLauncherOrReap(
      assignmentAttempt === 2
        ? { assign() { throw new Error("injected Windows jobs assignment failure"); } }
        : windowsJob,
      managed,
    );`,
        );
      writeFileSync(fixture.supervisorPath, source);

      const result = spawnSync(process.execPath, [fixture.supervisorPath, "--runtime=bun"], {
        cwd: fixture.root,
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
      });
      const launcherPids = existsSync(launcherPidPath)
        ? readFileSync(launcherPidPath, "utf8")
            .trim()
            .split("\n")
            .map((value) => Number.parseInt(value, 10))
        : [];
      for (const pid of launcherPids) {
        if (Number.isSafeInteger(pid) && pid > 0) ownedPids.add(pid);
      }
      try {
        expect(result.error, result.stderr).toBeUndefined();
        expect(result.status, result.stderr).toBe(1);
        expect(result.stderr).toContain("injected Windows jobs assignment failure");
        expect(result.stderr).toContain("Could not close the Windows jobs Job Object");
        expect(result.stderr).toContain("FFI library");
        expect(launcherPids).toHaveLength(2);
        for (const pid of launcherPids) {
          expect(Number.isSafeInteger(pid)).toBe(true);
          expect(processExists(pid)).toBe(false);
        }
        expect(existsSync(fixture.statePaths.worker)).toBe(false);
        expect(existsSync(fixture.statePaths.scheduler)).toBe(false);
      } finally {
        for (const pid of launcherPids) {
          if (Number.isSafeInteger(pid) && pid > 0) {
            forceKillOwnedTree(pid);
            ownedPids.delete(pid);
          }
        }
      }
    },
    15_000,
  );

  for (const runtime of ["bun", "node"] as const) {
    for (const exitingRole of ["worker", "scheduler"] as const) {
      test(`${runtime} contains a detached descendant after the ${exitingRole} root exits`, () => {
        const fixture = writeRuntimeFixture(runtime, exitingRole);
        const result = spawnSync(
          process.execPath,
          [fixture.supervisorPath, `--runtime=${runtime}`],
          {
            cwd: fixture.root,
            env: {
              ...process.env,
              JOBS_TEST_WORKER_STATE: fixture.statePaths.worker,
              JOBS_TEST_SCHEDULER_STATE: fixture.statePaths.scheduler,
            },
            encoding: "utf8",
            timeout: 20_000,
            windowsHide: true,
          },
        );

        expect(result.error).toBeUndefined();
        expect(result.status).toBe(23);
        for (const role of ["worker", "scheduler"] as const) {
          expect(existsSync(fixture.statePaths[role])).toBe(true);
          const state = JSON.parse(readFileSync(fixture.statePaths[role], "utf8")) as FixtureState;
          ownedPids.add(state.rootPid);
          ownedPids.add(state.descendantPid);
          expect(state).toMatchObject({ runtime, role });
          expect(processExists(state.rootPid)).toBe(false);
          expect(processExists(state.descendantPid)).toBe(false);
          ownedPids.delete(state.rootPid);
          ownedPids.delete(state.descendantPid);
        }
      }, 30_000);
    }
  }

  test("rejects launching the supervisor outside canonical Bun", () => {
    const node = Bun.which("node");
    if (node === null) throw new Error("Node is required for the runtime portability check");
    const fixture = writeRuntimeFixture("node", "worker");
    const result = spawnSync(node, [fixture.supervisorPath, "--runtime=node"], {
      cwd: fixture.root,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Jobs supervision requires Bun ${toolchainRuntime.bun}`);
    expect(existsSync(fixture.statePaths.worker)).toBe(false);
    expect(existsSync(fixture.statePaths.scheduler)).toBe(false);
  });
});
