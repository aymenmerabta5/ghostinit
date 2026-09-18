import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  assertTaskkillCompletedForCapturedProcesses,
  assertSuccessfulTaskkill,
  captureWindowsProcessIdentity,
  isCapturedWindowsProcessLive,
  parseWindowsProcessQuery,
  resolveWindowsSystemExecutable,
  terminateProcessTree,
  type CapturedCommandOutcome,
  type TaskkillOutcome,
  type WindowsProcessRecord,
} from "../helpers/process-tree.js";

const outcome = (partial: Partial<TaskkillOutcome> = {}): TaskkillOutcome => ({
  status: 0,
  signal: null,
  stderr: "",
  timedOut: false,
  ...partial,
});

const queryOutcome = (partial: Partial<CapturedCommandOutcome> = {}): CapturedCommandOutcome => ({
  status: 0,
  signal: null,
  stdout: "[]",
  stderr: "",
  timedOut: false,
  ...partial,
});

function forceKill(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5_000,
      windowsHide: true,
    });
  }
  try {
    process.kill(process.platform === "win32" ? pid : -pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The emergency target is already gone.
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("process-tree cleanup", () => {
  test("resolves Windows cleanup tools from canonical System32 despite cwd and PATH shadows", () => {
    if (process.platform !== "win32") return;
    const root = mkdtempSync(join(tmpdir(), "ghostinit-system-tool-shadow-"));
    try {
      const harmlessExecutable = join(process.env.SystemRoot!, "System32", "where.exe");
      const fakeTaskkill = join(root, "taskkill.exe");
      const fakePowerShell = join(root, "powershell.exe");
      copyFileSync(harmlessExecutable, fakeTaskkill);
      copyFileSync(harmlessExecutable, fakePowerShell);
      const pathEntry = Object.entries(process.env).find(([key]) => key.toUpperCase() === "PATH");
      if (!pathEntry) throw new Error("Windows PATH is unavailable");
      const [pathKey, pathValue] = pathEntry;
      const shadowed = spawnSync("taskkill", ["where.exe"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, [pathKey]: `${root};${pathValue}` },
        shell: false,
        windowsHide: true,
      });
      expect(shadowed.status).toBe(0);
      expect(shadowed.stdout.toLowerCase()).toContain("system32\\where.exe");

      const system32 = realpathSync(join(process.env.SystemRoot!, "System32"));
      for (const executable of ["taskkill", "powershell"] as const) {
        const resolved = resolveWindowsSystemExecutable(executable);
        const descendant = relative(system32, resolved);
        expect(isAbsolute(resolved), executable).toBe(true);
        expect(
          descendant !== ".." && !descendant.startsWith(".." + sep) && !isAbsolute(descendant),
          executable,
        ).toBe(true);
        expect(resolved.toLowerCase(), executable).not.toBe(
          (executable === "taskkill" ? fakeTaskkill : fakePowerShell).toLowerCase(),
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("accepts only a successful taskkill outcome", () => {
    expect(() => assertSuccessfulTaskkill(1234, outcome())).not.toThrow();
    expect(() => assertSuccessfulTaskkill(1234, outcome({ status: 1, stderr: "denied" }))).toThrow(
      "taskkill for PID 1234 failed with status 1: denied",
    );
    expect(() => assertSuccessfulTaskkill(1234, outcome({ timedOut: true }))).toThrow(
      "taskkill for PID 1234 timed out",
    );
    expect(() =>
      assertSuccessfulTaskkill(1234, outcome({ spawnError: new Error("missing executable") })),
    ).toThrow("taskkill for PID 1234 failed to spawn: missing executable");
  });

  test("fails closed when Windows descendant discovery is unconfirmed", () => {
    expect(
      parseWindowsProcessQuery(
        [1234],
        queryOutcome({
          stdout: '[{"pid":5678,"parentPid":1234,"createdAt":"2026-01-01T00:00:00Z"}]',
        }),
      ),
    ).toEqual([{ pid: 5678, parentPid: 1234, createdAt: "2026-01-01T00:00:00Z" }]);
    expect(() => parseWindowsProcessQuery([1234], queryOutcome({ timedOut: true }))).toThrow(
      "CIM process discovery timed out for root PID 1234",
    );
    expect(() =>
      parseWindowsProcessQuery(
        [1234],
        queryOutcome({ spawnError: new Error("missing PowerShell") }),
      ),
    ).toThrow("CIM process discovery failed to spawn for root PID 1234: missing PowerShell");
    expect(() =>
      parseWindowsProcessQuery([1234], queryOutcome({ status: 1, stderr: "query denied" })),
    ).toThrow("CIM process discovery failed for root PID 1234 with status 1: query denied");
    expect(() => parseWindowsProcessQuery([1234], queryOutcome({ stdout: "{}" }))).toThrow(
      "CIM process discovery returned an invalid process list for root PID 1234",
    );
  });

  test("accepts a taskkill disappearance race only when captured identities are gone or reused", () => {
    const captured: WindowsProcessRecord[] = [
      { pid: 1234, parentPid: 1, createdAt: "2026-01-01T00:00:00Z" },
      { pid: 5678, parentPid: 1234, createdAt: "2026-01-01T00:00:01Z" },
    ];
    const notFound = outcome({ status: 128, stderr: 'ERROR: The process "1234" not found.' });

    expect(() =>
      assertTaskkillCompletedForCapturedProcesses(1234, notFound, captured, []),
    ).not.toThrow();
    expect(() =>
      assertTaskkillCompletedForCapturedProcesses(1234, notFound, captured, [
        { pid: 1234, parentPid: 1, createdAt: "2026-01-02T00:00:00Z" },
        { pid: 5678, parentPid: 1234, createdAt: "2026-01-02T00:00:01Z" },
      ]),
    ).not.toThrow();
  });

  test("rejects a taskkill disappearance race while a captured descendant is live", () => {
    const captured: WindowsProcessRecord[] = [
      { pid: 1234, parentPid: 1, createdAt: "2026-01-01T00:00:00Z" },
      { pid: 5678, parentPid: 1234, createdAt: "2026-01-01T00:00:01Z" },
    ];
    const notFound = outcome({ status: 128, stderr: 'ERROR: The process "1234" not found.' });

    expect(() =>
      assertTaskkillCompletedForCapturedProcesses(1234, notFound, captured, [captured[1]]),
    ).toThrow(/captured processes still live: 5678@2026-01-01T00:00:01Z/);
  });

  test("does not return until a live root process has exited", async () => {
    const node = Bun.which("node");
    if (node === null) throw new Error("node executable was not found");
    const child = spawn(node, ["-e", "setInterval(() => {}, 1000)"], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    await new Promise<void>((resolveSpawn, reject) => {
      child.once("spawn", resolveSpawn);
      child.once("error", reject);
    });

    try {
      await terminateProcessTree(child);
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    } finally {
      forceKill(child.pid);
    }
  });

  test("cleans a live descendant after its root has already exited", async () => {
    const node = Bun.which("node");
    if (node === null) throw new Error("node executable was not found");
    const root = spawn(
      node,
      [
        "-e",
        `const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: process.platform === "win32", stdio: "ignore", windowsHide: true });
child.unref();
process.stdout.write(String(child.pid));`,
      ],
      {
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let descendantText = "";
    root.stdout.setEncoding("utf8");
    root.stdout.on("data", (chunk: string) => {
      descendantText += chunk;
    });
    await new Promise<void>((resolveExit, reject) => {
      root.once("exit", () => resolveExit());
      root.once("error", reject);
    });
    const descendantPid = Number.parseInt(descendantText, 10);
    if (!Number.isInteger(descendantPid)) throw new Error("descendant PID was not emitted");
    const captured = await captureWindowsProcessIdentity(descendantPid);
    if (process.platform === "win32") expect(captured).toBeDefined();

    try {
      expect(isAlive(descendantPid)).toBe(true);
      await terminateProcessTree(root, captured ? [captured] : []);
      if (captured) expect(await isCapturedWindowsProcessLive(captured)).toBe(false);
      else expect(isAlive(descendantPid)).toBe(false);
    } finally {
      forceKill(root.pid);
      forceKill(descendantPid);
    }
  });
});
