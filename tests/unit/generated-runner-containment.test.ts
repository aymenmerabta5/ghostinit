import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { EventEmitter } from "node:events";
import { cancelActiveRun, run as runGeneratedCommand } from "../../scripts/test-generated.js";
import { buildInstallEnv, runSupervisedCommand } from "../../src/commands/create/installer.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { findProbeProcess, type ProbeProcessIdentity } from "../helpers/probe-process-identity.js";
import { stageWorkerBindingFiles } from "../helpers/worker-binding-files.js";

const prefix = "ghostinit-runner-containment-";
const roots: Array<{ root: string; parent: string; cleanupVerified: boolean }> = [];
const privateOutput = { redact: ["private-probe-output"] };

function fixture() {
  const root = createTemporaryWorkspace(prefix);
  const entry = { root, parent: dirname(root), cleanupVerified: true };
  roots.push(entry);
  return entry;
}

function run(...args: Parameters<typeof runGeneratedCommand>) {
  const entry = roots.find(({ root }) => root === args[2]);
  if (!entry) throw new Error("Untracked generated-runner probe workspace");
  entry.cleanupVerified = false;
  const pending = runGeneratedCommand(...args);
  void pending.then(
    (result) => {
      entry.cleanupVerified = result.cleanupVerified;
    },
    () => {},
  );
  // Preserve the exact operation promise used by cancellation identity checks.
  return pending;
}

afterEach(async () => {
  const cancelled = await cancelActiveRun("SIGTERM");
  if (cancelled && !cancelled.cleanupVerified) {
    throw new Error("Generated-runner probe cleanup was not verified; retaining workspaces");
  }
  for (const entry of roots) {
    if (!entry.cleanupVerified) {
      throw new Error(`Generated-runner probe cleanup was not verified: ${entry.root}`);
    }
    const identityFile = join(entry.root, "writer.pid");
    if (existsSync(identityFile)) {
      const identity = JSON.parse(readFileSync(identityFile, "utf8")) as ProbeProcessIdentity;
      if (findProbeProcess(identity) !== undefined) {
        throw new Error(`Generated-runner descendant is still alive: ${entry.root}`);
      }
    }
    if (dirname(resolve(entry.root)) !== entry.parent || !basename(entry.root).startsWith(prefix)) {
      throw new Error("Unsafe generated-runner probe cleanup");
    }
  }
  for (const entry of roots.splice(0)) {
    rmSync(entry.root, { recursive: true, force: true, maxRetries: 5 });
  }
});

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error("Generated-runner descendant did not start");
    await Bun.sleep(20);
  }
}

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

async function assertStopped(root: string): Promise<void> {
  const identity = JSON.parse(
    readFileSync(join(root, "writer.pid"), "utf8"),
  ) as ProbeProcessIdentity;
  expect(findProbeProcess(identity)).toBeUndefined();
  rmSync(join(root, "writer.marker"), { force: true });
  await Bun.sleep(600);
  expect(existsSync(join(root, "writer.marker"))).toBe(false);
}

describe("generated command retained containment", () => {
  for (const exitCode of [0, 7]) {
    test(`exit ${exitCode} drains a detached stdio-ignored writer before returning`, async () => {
      const entry = fixture();
      const result = await run(
        process.execPath,
        writerCommand(entry.root, exitCode),
        entry.root,
        privateOutput,
      );
      expect(result.cleanupVerified).toBe(true);
      expect(result.exitCode).toBe(exitCode);
      expect(result.signal).toBeNull();
      expect(result.timedOut).toBe(false);
      expect(result.ok).toBe(exitCode === 0);
      await assertStopped(entry.root);
    }, 90_000);
  }

  test("cancellation joins the same run before restoring exact Worker bindings", async () => {
    const entry = fixture();
    const original = 'AUTH_SECRET="original-probe"\r\n';
    const staged = 'AUTH_SECRET="fixture-probe"\n';
    const transaction = new FsTransaction(entry.root);
    await transaction.write(".dev.vars", original);
    await transaction.commit();
    const bindings = await stageWorkerBindingFiles(entry.root, [
      { path: ".dev.vars", original, content: staged },
    ]);
    const pending = run(process.execPath, writerCommand(entry.root), entry.root, privateOutput);
    await waitForFile(join(entry.root, "writer.ready"));
    expect(cancelActiveRun("SIGTERM")).toBe(pending);
    expect(cancelActiveRun("SIGTERM")).toBe(pending);
    const result = await pending;
    expect(result).toMatchObject({
      ok: false,
      signal: "SIGTERM",
      timedOut: false,
      cleanupVerified: true,
    });
    const restoration = bindings.restore(result.cleanupVerified);
    expect(bindings.restore(result.cleanupVerified)).toBe(restoration);
    await restoration;
    expect(readFileSync(join(entry.root, ".dev.vars"), "utf8")).toBe(original);
    await assertStopped(entry.root);
  }, 90_000);

  test("timeout reports failure only after the detached writer has stopped", async () => {
    const entry = fixture();
    const result = await run(process.execPath, writerCommand(entry.root), entry.root, {
      ...privateOutput,
      timeoutMs: 1_500,
    });
    expect(result).toMatchObject({ ok: false, timedOut: true, cleanupVerified: true });
    await assertStopped(entry.root);
  }, 90_000);

  test("retains complete bounded stream tails and caller env while redacting split secrets", async () => {
    const { root } = fixture();
    const secret = "private-split-runner-value";
    const result = await run(
      process.execPath,
      [
        "-e",
        `
const secret = process.env.RUNNER_PROBE_SECRET;
process.stdout.write("x".repeat(600_000));
process.stdout.write(secret.slice(0, 10));
setTimeout(() => {
  process.stdout.write(secret.slice(10) + " stdout-end");
  process.stderr.write("y".repeat(600_000) + secret + " stderr-end");
}, 20);
`,
      ],
      root,
      {
        env: { ...buildInstallEnv(root), RUNNER_PROBE_SECRET: secret },
        redact: [secret],
      },
    );
    expect(result).toMatchObject({ ok: true, exitCode: 0, cleanupVerified: true });
    expect(result.stdout.length).toBeLessThanOrEqual(512 * 1024);
    expect(result.stderr.length).toBeLessThanOrEqual(512 * 1024);
    expect(result.stdout.endsWith("[REDACTED] stdout-end")).toBe(true);
    expect(result.stderr.endsWith("[REDACTED] stderr-end")).toBe(true);
    expect(result.output).not.toContain(secret);
  }, 90_000);

  test("pre-cancelled supervision starts no command and reports verified cancellation", async () => {
    const { root } = fixture();
    const controller = new AbortController();
    controller.abort("SIGINT");
    const result = await runSupervisedCommand({
      command: process.execPath,
      argv: ["-e", 'require("node:fs").writeFileSync("unexpected-start", "started")'],
      cwd: root,
      label: "pre-cancelled runner probe",
      timeoutMs: 5_000,
      abortSignal: controller.signal,
      signalSource: new EventEmitter(),
    });
    expect(result).toMatchObject({
      exitCode: null,
      signal: "SIGINT",
      timedOut: false,
      cleanupVerified: true,
    });
    expect(existsSync(join(root, "unexpected-start"))).toBe(false);
  });
});
