// @allow-long 492: cross-platform containment and deterministic orphan regressions share lifecycle fixtures
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { deployFiles } from "../../src/templates/root/deploy.js";
import { productionProcessSupervisorContent } from "../../src/templates/root/process-supervisor.js";

const roots: string[] = [];

function forceKill(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5_000,
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The detached fixture is already gone.
    }
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<number | null> {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | undefined, code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(code);
    };
    const timer = setTimeout(() => {
      if (child.pid !== undefined) forceKill(child.pid);
      finish(new Error("Timed out waiting for the generated supervisor"), null);
    }, timeoutMs);
    child.once("error", (error) => finish(error, null));
    child.once("close", (code) => finish(undefined, code));
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("generated production supervisor propagates failure and stops descendant writers", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-deploy-supervisor-"));
  roots.push(root);
  const marker = join(root, "slow-worker.txt");
  const supervisor = deployFiles("demo", "docker", "bun", {
    mode: "single",
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    messaging: false,
    jobs: false,
    storage: true,
  }).find(({ path }) => path === "scripts/start-production.mjs");
  if (!supervisor) throw new Error("Generated production supervisor is missing");

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      scripts: {
        start: "node fast.mjs",
        "storage:cleanup-worker": "node slow.mjs",
      },
    }),
  );
  writeFileSync(join(root, "fast.mjs"), "setTimeout(() => process.exit(7), 1_000);\n");
  writeFileSync(
    join(root, "slow.mjs"),
    `import { writeFileSync } from "node:fs";
const marker = process.env.MARKER;
if (!marker) throw new Error("MARKER is required");
writeFileSync(marker, "started");
setInterval(() => writeFileSync(marker, String(Date.now())), 25);
`,
  );
  writeFileSync(join(root, "supervisor.mjs"), supervisor.content);

  const result = spawnSync(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, MARKER: marker },
    shell: false,
    timeout: 15_000,
    windowsHide: true,
  });
  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(7);
  expect(existsSync(marker)).toBe(true);

  rmSync(marker, { force: true });
  await Bun.sleep(300);
  expect(existsSync(marker)).toBe(false);
}, 20_000);

test("unexpected clean exit fails closed and stops peers within one concurrent grace window", () => {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-deploy-supervisor-concurrent-"));
  roots.push(root);
  const slowScript = `process.once("SIGTERM", () => setTimeout(() => process.exit(0), 2_000));
setInterval(() => {}, 1_000);
`;
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      scripts: {
        fast: "node fast.mjs",
        "slow-a": "node slow-a.mjs",
        "slow-b": "node slow-b.mjs",
      },
    }),
  );
  writeFileSync(join(root, "fast.mjs"), "setTimeout(() => process.exit(0), 300);\n");
  writeFileSync(join(root, "slow-a.mjs"), slowScript);
  writeFileSync(join(root, "slow-b.mjs"), slowScript);
  writeFileSync(
    join(root, "supervisor.mjs"),
    productionProcessSupervisorContent(["fast", "slow-a", "slow-b"]),
  );

  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ["supervisor.mjs"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  const elapsedMs = Date.now() - startedAt;

  expect(result.error, result.stderr).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  // Windows Job Object termination is immediate. On POSIX, both two-second graceful handlers
  // must overlap; sequential shutdown would take more than four seconds.
  expect(elapsedMs).toBeLessThan(3_500);
}, 15_000);

test("Windows application launch is gated behind Job Object assignment", () => {
  const source = productionProcessSupervisorContent(["web"]);
  const launcherSpawn = source.indexOf(
    "windowsJob ? [SUPERVISOR_PATH, WINDOWS_JOB_LAUNCHER_ARG, script]",
  );
  const recorded = source.indexOf("children.push(managed);", launcherSpawn);
  const assignment = source.indexOf(
    "await assignWindowsLauncherOrReap(windowsJob, managed);",
    recorded,
  );
  const admission = source.indexOf("children.map(admitWindowsLauncher)");

  expect(launcherSpawn).toBeGreaterThan(-1);
  expect(source).toContain('stdio: windowsJob ? ["inherit", "inherit", "inherit", "ipc"]');
  expect(source).toContain("await waitForWindowsJobAdmission()");
  expect(source.slice(source.indexOf("const windowsJob = await createWindowsJob()"))).not.toContain(
    'spawn(process.execPath, ["run", script]',
  );
  expect(recorded).toBeGreaterThan(launcherSpawn);
  expect(assignment).toBeGreaterThan(recorded);
  expect(admission).toBeGreaterThan(assignment);
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
  expect(source).toContain('managed.child.kill("SIGKILL")');
  expect(source).toContain("await waitForChildExit(managed.child, FORCED_MS)");
});

test.skipIf(process.platform !== "win32")(
  "Windows cleanup reaps launchers before aggregating assignment and Job-close failures",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-deploy-supervisor-assign-failure-"));
    roots.push(root);
    const launcherPidPath = join(root, "launchers.pid");
    const appStartedMarker = join(root, "app-started.txt");
    const propagatedErrorMarker = join(root, "propagated-error.txt");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        scripts: { owner: "bun owner.mjs", peer: "bun owner.mjs" },
      }),
    );
    writeFileSync(
      join(root, "owner.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(appStartedMarker)}, "started");
setInterval(() => {}, 1000);
`,
    );
    const importNeedle = 'import { readdirSync, readFileSync } from "node:fs";';
    const childrenNeedle = "const children = [];";
    const assignmentNeedle = "  await assignWindowsLauncherOrReap(windowsJob, managed);";
    const closeNeedle = "kernel.symbols.CloseHandle(handle) === 0";
    const libraryCloseNeedle = `try {
        kernel.close();
      } catch (error) {`;
    let supervisor = productionProcessSupervisorContent(["owner", "peer"]);
    expect(supervisor).toContain(importNeedle);
    expect(supervisor).toContain(childrenNeedle);
    expect(supervisor).toContain(assignmentNeedle);
    expect(supervisor).toContain(closeNeedle);
    expect(supervisor).toContain(libraryCloseNeedle);
    supervisor = supervisor
      .replace(importNeedle, 'import { readdirSync, readFileSync, writeFileSync } from "node:fs";')
      .replace(childrenNeedle, `${childrenNeedle}\nlet assignmentAttempt = 0;`)
      .replace(closeNeedle, `(kernel.symbols.CloseHandle(handle), 0) === 0`)
      .replace(
        libraryCloseNeedle,
        `try {
        throw new Error("injected Windows production FFI library close failure");
      } catch (error) {`,
      )
      .replace(
        assignmentNeedle,
        `  assignmentAttempt += 1;
  writeFileSync(${JSON.stringify(launcherPidPath)}, String(managed.child.pid) + "\\n", { flag: "a" });
  await assignWindowsLauncherOrReap(
    assignmentAttempt === 2
      ? { assign() { throw new Error("injected Windows production assignment failure"); } }
      : windowsJob,
    managed,
  );`,
      );
    writeFileSync(join(root, "supervisor.mjs"), supervisor);
    writeFileSync(
      join(root, "assignment-harness.mjs"),
      `import { writeFileSync } from "node:fs";
try {
  await import("./supervisor.mjs");
  process.exit(2);
} catch (error) {
  const details = error instanceof AggregateError
    ? [error.message, ...error.errors.map((entry) => entry instanceof Error ? entry.message : String(entry))].join("\\n")
    : error instanceof Error ? error.message : String(error);
  writeFileSync(${JSON.stringify(propagatedErrorMarker)}, details);
  await Bun.sleep(1_500);
  process.exit(37);
}
`,
    );

    let stderr = "";
    const child = spawn(process.execPath, ["assignment-harness.mjs"], {
      cwd: root,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const launcherPids: number[] = [];
    try {
      await waitForFile(propagatedErrorMarker, 5_000);
      if (existsSync(launcherPidPath)) {
        launcherPids.push(
          ...readFileSync(launcherPidPath, "utf8")
            .trim()
            .split("\n")
            .map((value) => Number.parseInt(value, 10)),
        );
      }
      expect(child.pid).toBeDefined();
      expect(processExists(child.pid!)).toBe(true);
      const propagatedError = readFileSync(propagatedErrorMarker, "utf8");
      expect(propagatedError).toContain("injected Windows production assignment failure");
      expect(propagatedError).toContain("Could not close the Windows production Job Object");
      expect(propagatedError).toContain("FFI library");
      expect(launcherPids).toHaveLength(2);
      for (const pid of launcherPids) {
        expect(Number.isSafeInteger(pid)).toBe(true);
        expect(processExists(pid)).toBe(false);
      }
      expect(existsSync(appStartedMarker)).toBe(false);
      expect(await waitForExit(child, 5_000), stderr).toBe(37);
    } finally {
      if (child.pid !== undefined && processExists(child.pid)) forceKill(child.pid);
      for (const pid of launcherPids) if (processExists(pid)) forceKill(pid);
    }
  },
  15_000,
);

test.skipIf(process.platform !== "win32")(
  "Windows Job assignment delay cannot expose application code or a detached orphan",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-deploy-supervisor-preassign-"));
    roots.push(root);
    const assignmentWindowMarker = join(root, "assignment-window.txt");
    const appStartedMarker = join(root, "app-started.txt");
    const writerMarker = join(root, "writer.txt");
    const pidFile = join(root, "writer.pid");
    let detachedPid = 0;
    let cleanupRequired = false;

    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        scripts: { owner: "bun owner.mjs" },
      }),
    );
    writeFileSync(
      join(root, "writer.mjs"),
      `import { writeFileSync } from "node:fs";
const marker = process.env.WRITER_MARKER;
if (!marker) throw new Error("WRITER_MARKER is required");
writeFileSync(marker, "started");
setInterval(() => writeFileSync(marker, String(Date.now())), 20);
`,
    );
    writeFileSync(
      join(root, "owner.mjs"),
      `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync(process.env.APP_STARTED_MARKER, "started");
const child = spawn(process.execPath, ["writer.mjs"], {
  detached: true,
  env: process.env,
  stdio: "ignore",
  windowsHide: true,
});
if (child.pid === undefined) throw new Error("Detached writer PID is missing");
child.unref();
writeFileSync(process.env.PID_FILE, String(child.pid));
await Bun.sleep(100);
`,
    );

    const importNeedle = 'import { readdirSync, readFileSync } from "node:fs";';
    const assignmentNeedle = "  await assignWindowsLauncherOrReap(windowsJob, managed);";
    let supervisor = productionProcessSupervisorContent(["owner"]);
    expect(supervisor).toContain(importNeedle);
    expect(supervisor).toContain(assignmentNeedle);
    supervisor = supervisor
      .replace(importNeedle, 'import { readdirSync, readFileSync, writeFileSync } from "node:fs";')
      .replace(
        assignmentNeedle,
        `  writeFileSync(process.env.ASSIGNMENT_WINDOW_MARKER, "entered");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
${assignmentNeedle}`,
      );
    writeFileSync(join(root, "supervisor.mjs"), supervisor);

    let stderr = "";
    const child = spawn(process.execPath, ["supervisor.mjs"], {
      cwd: root,
      env: {
        ...process.env,
        APP_STARTED_MARKER: appStartedMarker,
        ASSIGNMENT_WINDOW_MARKER: assignmentWindowMarker,
        PID_FILE: pidFile,
        WRITER_MARKER: writerMarker,
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    try {
      await waitForFile(assignmentWindowMarker, 3_000);
      await Bun.sleep(750);
      expect(existsSync(appStartedMarker)).toBe(false);

      const exitCode = await waitForExit(child, 8_000);
      expect(exitCode, stderr).toBe(1);
      expect(existsSync(appStartedMarker)).toBe(true);
      expect(existsSync(writerMarker)).toBe(true);
      detachedPid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
      expect(Number.isInteger(detachedPid)).toBe(true);
      cleanupRequired = true;

      rmSync(writerMarker, { force: true });
      await Bun.sleep(300);
      const leaked = existsSync(writerMarker);
      if (!leaked) cleanupRequired = false;
      expect(leaked).toBe(false);
    } finally {
      if (child.exitCode === null && child.pid !== undefined) forceKill(child.pid);
      if (cleanupRequired && detachedPid > 0) forceKill(detachedPid);
    }
  },
  15_000,
);

test("stops a detached descendant after its owning command exits", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-deploy-supervisor-detached-"));
  roots.push(root);
  const marker = join(root, "detached-writer.txt");
  const pidFile = join(root, "detached.pid");
  let detachedPid = 0;
  let cleanupRequired = false;
  const writer = `import { writeFileSync } from "node:fs";
const marker = process.env.MARKER;
if (!marker) throw new Error("MARKER is required");
setInterval(() => writeFileSync(marker, String(Date.now())), 25);
`;
  const owner = `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const child = spawn(process.execPath, ["detached-writer.mjs"], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
if (child.pid === undefined) throw new Error("Detached writer PID is missing");
child.unref();
writeFileSync(process.env.PID_FILE, String(child.pid));
await new Promise((resolve) => setTimeout(resolve, 500));
`;

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      scripts: {
        owner: "node owner.mjs",
        peer: "node peer.mjs",
      },
    }),
  );
  writeFileSync(join(root, "detached-writer.mjs"), writer);
  writeFileSync(join(root, "owner.mjs"), owner);
  writeFileSync(join(root, "peer.mjs"), "setInterval(() => {}, 1_000);\n");
  writeFileSync(
    join(root, "supervisor.mjs"),
    productionProcessSupervisorContent(["owner", "peer"]),
  );

  try {
    const result = spawnSync(process.execPath, ["supervisor.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MARKER: marker, PID_FILE: pidFile },
      shell: false,
      timeout: 15_000,
      windowsHide: true,
    });
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(marker)).toBe(true);
    detachedPid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
    expect(Number.isInteger(detachedPid)).toBe(true);
    cleanupRequired = true;

    rmSync(marker, { force: true });
    await Bun.sleep(300);
    const leaked = existsSync(marker);
    if (!leaked) cleanupRequired = false;
    expect(leaked).toBe(false);
  } finally {
    if (cleanupRequired && detachedPid > 0) forceKill(detachedPid);
  }
}, 20_000);
