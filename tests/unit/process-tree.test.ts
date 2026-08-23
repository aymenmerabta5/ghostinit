import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
  assertSuccessfulTaskkill,
  terminateProcessTree,
  type TaskkillOutcome,
} from "../helpers/process-tree.js";

const outcome = (partial: Partial<TaskkillOutcome> = {}): TaskkillOutcome => ({
  status: 0,
  signal: null,
  stderr: "",
  timedOut: false,
  ...partial,
});

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

    await terminateProcessTree(child);

    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});
