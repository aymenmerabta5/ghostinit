import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  assertSuccessfulTaskkill,
  parseWindowsProcessQuery,
  terminateProcessTree,
  type CapturedCommandOutcome,
  type TaskkillOutcome,
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
      parseWindowsProcessQuery([1234], queryOutcome({ stdout: '[{"pid":5678,"parentPid":1234}]' })),
    ).toEqual([{ pid: 5678, parentPid: 1234 }]);
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

    try {
      expect(isAlive(descendantPid)).toBe(true);
      await terminateProcessTree(root);
      expect(isAlive(descendantPid)).toBe(false);
    } finally {
      forceKill(root.pid);
      forceKill(descendantPid);
    }
  });
});
