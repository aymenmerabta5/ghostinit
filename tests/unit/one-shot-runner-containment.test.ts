import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertFixtureStageCleanup,
  cancelActiveFixtureStage,
  runStage,
} from "../../scripts/test-fixtures.js";
import { buildInstallEnv } from "../../src/commands/create/installer.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { findProbeProcess, type ProbeProcessIdentity } from "../helpers/probe-process-identity.js";
import { runCommand, terminateTrackedProcesses } from "../integration/e2e-build-process.js";

type Runner = "fixture" | "e2e";
const prefix = "ghostinit-one-shot-containment-";
const roots: Array<{ root: string; parent: string }> = [];

function fixture(): string {
  const root = createTemporaryWorkspace(prefix);
  roots.push({ root, parent: dirname(root) });
  return root;
}

afterEach(async () => {
  // These joins must finish before any probe workspace can be removed.
  await cancelActiveFixtureStage("SIGTERM");
  assertFixtureStageCleanup();
  await terminateTrackedProcesses();
  for (const entry of roots.splice(0)) {
    if (dirname(resolve(entry.root)) !== entry.parent || !basename(entry.root).startsWith(prefix)) {
      throw new Error("Unsafe one-shot probe cleanup");
    }
    rmSync(entry.root, { recursive: true, force: true, maxRetries: 5 });
  }
});

function writerCommand(root: string, exitCode?: number): string[] {
  const marker = join(root, "writer.marker");
  const ready = join(root, "writer.ready");
  const pidFile = join(root, "writer.pid");
  const writer = `
const fs = require("node:fs");
const { captureProbeProcessIdentity } = require(${JSON.stringify(resolve(import.meta.dir, "../helpers/probe-process-identity.ts"))});
fs.writeFileSync(${JSON.stringify(pidFile)}, JSON.stringify(captureProbeProcessIdentity()));
fs.writeFileSync(${JSON.stringify(ready)}, "ready");
setInterval(() => fs.writeFileSync(${JSON.stringify(marker)}, "late mutation"), 40);
setTimeout(() => process.exit(0), 4_000);
`;
  return [
    "-e",
    `
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", ${JSON.stringify(writer)}], {
  detached: true, stdio: "ignore", windowsHide: true,
});
child.unref();
${
  exitCode === undefined
    ? ""
    : `const readyCheck = setInterval(() => {
  if (!fs.existsSync(${JSON.stringify(marker)})) return;
  clearInterval(readyCheck);
  process.exit(${exitCode});
}, 10);`
}
setTimeout(() => process.exit(9), 4_500);
`,
  ];
}

function start(runner: Runner, root: string, args: string[], timeoutMs = 30_000) {
  return runner === "fixture"
    ? runStage(
        { id: "containment-probe", directory: root, stages: [] },
        { label: "one-shot", args, timeoutMs },
      )
    : runCommand(process.execPath, args, root, timeoutMs);
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error("One-shot descendant did not start");
    await Bun.sleep(20);
  }
}

async function assertStopped(root: string): Promise<void> {
  const identity = JSON.parse(
    readFileSync(join(root, "writer.pid"), "utf8"),
  ) as ProbeProcessIdentity;
  expect(findProbeProcess(identity)).toBeUndefined();
  rmSync(join(root, "writer.marker"), { force: true });
  await Bun.sleep(600);
  expect(existsSync(join(root, "writer.marker"))).toBe(false);
}

describe("one-shot fixture and E2E containment", () => {
  for (const runner of ["fixture", "e2e"] as const) {
    for (const exitCode of [0, 7]) {
      test(`${runner} exit ${exitCode} waits for its detached stdio-ignored writer`, async () => {
        const root = fixture();
        const result = await start(runner, root, writerCommand(root, exitCode));
        if (typeof result === "boolean") expect(result).toBe(exitCode === 0);
        else {
          expect(result).toMatchObject({ exitCode, signal: null, timedOut: false });
          expect(result.error).toBeUndefined();
        }
        await assertStopped(root);
      }, 90_000);
    }

    test(`${runner} timeout waits for its detached writer`, async () => {
      const root = fixture();
      const result = await start(runner, root, writerCommand(root), 1_500);
      if (typeof result === "boolean") expect(result).toBe(false);
      else {
        expect(result.timedOut).toBe(true);
        expect(result.error).toBeUndefined();
      }
      await assertStopped(root);
    }, 90_000);

    test(`${runner} cancellation joins the operation before afterEach can remove its workspace`, async () => {
      const root = fixture();
      const pending = start(runner, root, writerCommand(root));
      await waitForFile(join(root, "writer.ready"));
      if (runner === "fixture") {
        expect(cancelActiveFixtureStage("SIGTERM")).toBe(pending);
        expect(cancelActiveFixtureStage("SIGTERM")).toBe(pending);
      } else {
        const cleanup = terminateTrackedProcesses();
        expect(terminateTrackedProcesses()).toBe(cleanup);
        const rejectedStartup = runCommand(
          process.execPath,
          ["-e", 'require("node:fs").writeFileSync("unexpected-start", "started")'],
          root,
        );
        await cleanup;
        expect((await rejectedStartup).signal).toBe("SIGTERM");
        expect(existsSync(join(root, "unexpected-start"))).toBe(false);
      }
      const result = await pending;
      if (typeof result === "boolean") expect(result).toBe(false);
      else expect(result).toMatchObject({ signal: "SIGTERM", timedOut: false });
      await assertStopped(root);
    }, 90_000);
  }

  test("E2E preserves caller environment and both bounded stream tails", async () => {
    const root = fixture();
    const result = await runCommand(
      process.execPath,
      [
        "-e",
        `
process.stdout.write("x".repeat(600_000) + process.env.PROBE_VALUE + " stdout-end");
process.stderr.write("y".repeat(600_000) + process.env.PROBE_VALUE + " stderr-end");
`,
      ],
      root,
      30_000,
      { ...buildInstallEnv(root), PROBE_VALUE: "fixture-value" },
    );
    expect(result).toMatchObject({ exitCode: 0, signal: null, timedOut: false });
    expect(result.error).toBeUndefined();
    expect(result.stdout.length).toBe(512 * 1024);
    expect(result.stderr.length).toBe(512 * 1024);
    expect(result.stdout.endsWith("fixture-value stdout-end")).toBe(true);
    expect(result.stderr.endsWith("fixture-value stderr-end")).toBe(true);
  }, 90_000);

  for (const runner of ["fixture", "e2e"] as const) {
    test(`${runner} afterEach retains a workspace after an unverified completed command`, async () => {
      const root = fixture();
      const fixtureUrl = pathToFileURL(
        resolve(import.meta.dir, "../../scripts/test-fixtures.ts"),
      ).href;
      const e2eUrl = pathToFileURL(
        resolve(import.meta.dir, "../integration/e2e-build-process.ts"),
      ).href;
      const identityUrl = pathToFileURL(
        resolve(import.meta.dir, "../helpers/probe-process-identity.ts"),
      ).href;
      const command = `
import { writeFileSync } from "node:fs";
import { captureProbeProcessIdentity } from ${JSON.stringify(identityUrl)};
if (process.platform === "linux") {
  writeFileSync("guard.identity", JSON.stringify(captureProbeProcessIdentity(process.ppid)));
} else {
  setTimeout(() => process.kill(process.ppid, "SIGKILL"), 100);
}
setTimeout(() => process.exit(0), 1_500);
`;
      const result = await runCommand(
        process.execPath,
        [
          "-e",
          `
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { runStage, cancelActiveFixtureStage, assertFixtureStageCleanup } from ${JSON.stringify(fixtureUrl)};
import { runCommand, terminateTrackedProcesses } from ${JSON.stringify(e2eUrl)};
import { killProbeProcess } from ${JSON.stringify(identityUrl)};
mkdirSync("preserved");
const fixture = ${JSON.stringify(runner === "fixture")};
const start = (source) => fixture
  ? runStage({ id: "guard-loss", directory: process.cwd(), stages: [] }, { label: "one-shot", args: ["-e", source], timeoutMs: 5_000 })
  : runCommand(process.execPath, ["-e", source], process.cwd(), 5_000);
const pending = start(${JSON.stringify(command)});
if (process.platform === "linux") {
  const deadline = Date.now() + 5_000;
  while (!existsSync("guard.identity")) {
    if (Date.now() >= deadline) throw new Error("Guard identity was not published");
    await Bun.sleep(10);
  }
  // This observer is in an ancestor PID namespace, so it may kill nested init.
  killProbeProcess(JSON.parse(readFileSync("guard.identity", "utf8")));
}
const result = await pending;
await start('require("node:fs").writeFileSync("unexpected-start", "started")');
let cleanupRefused = false;
try {
  if (fixture) { await cancelActiveFixtureStage("SIGTERM"); assertFixtureStageCleanup(); }
  else { await terminateTrackedProcesses(); }
  rmSync("preserved", { recursive: true });
} catch { cleanupRefused = true; }
console.log(JSON.stringify({ commandFailed: fixture ? result === false : !!result.error, cleanupRefused, preserved: existsSync("preserved"), laterStageStarted: existsSync("unexpected-start") }));
`,
        ],
        root,
        30_000,
      );
      expect(result.error).toBeUndefined();
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)!)).toEqual({
        commandFailed: true,
        cleanupRefused: true,
        preserved: true,
        laterStageStarted: false,
      });
    }, 90_000);
  }
});
