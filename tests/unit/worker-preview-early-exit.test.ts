import { describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  captureWorkerPreviewOwnership,
  releaseWorkerPreviewHandles,
  stopWorkerPreview,
} from "../../scripts/test-generated.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { destroyFixture, type RuntimeFixture } from "../helpers/cloudflare-runtime-fixture.js";
import {
  captureWindowsProcessIdentity,
  isCapturedWindowsProcessLive,
  terminateProcessTree,
  type WindowsProcessRecord,
} from "../helpers/process-tree.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import { stageWorkerBindingFiles } from "../helpers/worker-binding-files.js";

async function waitUntil(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(25);
  expect(predicate()).toBe(true);
}

async function finiteExit(record: WindowsProcessRecord): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (await isCapturedWindowsProcessLive(record)) {
    if (Date.now() >= deadline)
      throw new Error("Finite preview child did not exit; retaining fixture");
    await Bun.sleep(100);
  }
}

async function fixture(mode: "known" | "late", exitCode: number): Promise<RuntimeFixture> {
  const root = createTemporaryWorkspace("ghostinit-cloudflare-preview-failure-");
  const tx = new FsTransaction(root);
  await tx.write(".dev.vars", "SERVER_SECRET=original-preview-value\n");
  await tx.write(
    "leaf.mjs",
    `import { writeFileSync } from "node:fs";
writeFileSync(".leaf-ready", String(process.pid));
setInterval(() => writeFileSync(".heartbeat", String(Date.now())), 50);
setTimeout(() => process.exit(0), 10_000);
`,
  );
  await tx.write(
    "branch.mjs",
    `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
spawn(process.execPath, ["leaf.mjs"], { detached: true, stdio: ["ignore", "inherit", "inherit"], windowsHide: true }).unref();
writeFileSync(".branch-ready", String(process.pid));
setTimeout(() => process.exit(0), 10_000);
`,
  );
  await tx.write(
    "preview.mjs",
    `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const launch = () => spawn(process.execPath, ["branch.mjs"], { detached: true, stdio: ["ignore", "inherit", "inherit"], windowsHide: true }).unref();
${mode === "known" ? "launch();" : ""}
writeFileSync(".root-ready", String(process.pid));
process.stdin.once("data", () => {
  ${mode === "late" ? "launch();" : ""}
  setTimeout(() => process.exit(${exitCode}), 100);
});
process.stdin.resume();
setTimeout(() => process.exit(2), 20_000);
`,
  );
  await tx.commit();
  return { root, script: "preview.mjs" };
}

function startPreview(target: RuntimeFixture): ChildProcess {
  const child = spawn(process.execPath, [target.script], {
    cwd: target.root,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout!.resume();
  child.stderr!.resume();
  return child;
}

async function descendantIdentities(target: RuntimeFixture): Promise<WindowsProcessRecord[]> {
  const records: WindowsProcessRecord[] = [];
  for (const name of [".branch-ready", ".leaf-ready"]) {
    await waitUntil(() => existsSync(join(target.root, name)));
    const record = await captureWindowsProcessIdentity(
      Number(readFileSync(join(target.root, name), "utf8")),
    );
    if (record) records.push(record);
  }
  return records;
}

describe.skipIf(process.platform !== "win32")("Worker unexpected Windows preview exit", () => {
  test("an early nonzero exit reaps the captured grandchild but still retains failed verification and bindings", async () => {
    const target = await fixture("known", 1);
    const original = readFileSync(join(target.root, ".dev.vars"), "utf8");
    const staged = "SERVER_SECRET=staged-preview-value\n";
    const bindings = await stageWorkerBindingFiles(target.root, [
      { path: ".dev.vars", original, content: staged },
    ]);
    const child = startPreview(target);
    let descendants: WindowsProcessRecord[] = [];
    try {
      descendants = await descendantIdentities(target);
      expect(descendants).toHaveLength(2);
      const captured = await captureWorkerPreviewOwnership(child);
      for (const record of descendants) {
        expect(
          captured.some(
            (entry) =>
              entry.pid === record.pid &&
              Date.parse(entry.createdAt) === Date.parse(record.createdAt),
          ),
        ).toBe(true);
      }
      child.stdin!.write("exit\n");
      await waitUntil(() => child.exitCode !== null);
      await expect(stopWorkerPreview(child)).rejects.toThrow(
        "exited before graceful shutdown began",
      );
      releaseWorkerPreviewHandles(child);
      for (const record of descendants)
        expect(await isCapturedWindowsProcessLive(record)).toBe(false);
      expect(child.exitCode).toBe(1);
      await expect(bindings.restore(false)).rejects.toThrow(
        "Worker processes must stop before restoring bindings",
      );
      expect(readFileSync(join(target.root, ".dev.vars"), "utf8")).toBe(staged);
    } finally {
      releaseWorkerPreviewHandles(child);
      await waitUntil(() => child.exitCode !== null);
      await Promise.all([...descendants, ...(await descendantIdentities(target))].map(finiteExit));
      await bindings.restore(true);
      destroyFixture(target);
    }
  });

  test("an unexpected zero exit cannot certify or kill late uncaptured descendants", async () => {
    const target = await fixture("late", 0);
    const original = readFileSync(join(target.root, ".dev.vars"), "utf8");
    const staged = "SERVER_SECRET=late-preview-value\n";
    const bindings = await stageWorkerBindingFiles(target.root, [
      { path: ".dev.vars", original, content: staged },
    ]);
    const child = startPreview(target);
    let descendants: WindowsProcessRecord[] = [];
    try {
      await waitUntil(() => existsSync(join(target.root, ".root-ready")));
      const captured = await captureWorkerPreviewOwnership(child);
      expect(captured.some((record) => record.pid === child.pid)).toBe(true);
      expect(existsSync(join(target.root, ".branch-ready"))).toBe(false);
      child.stdin!.write("exit\n");
      await waitUntil(() => child.exitCode !== null);
      descendants = await descendantIdentities(target);
      expect(descendants).toHaveLength(2);
      await expect(stopWorkerPreview(child)).rejects.toThrow(
        "exited before graceful shutdown began",
      );
      releaseWorkerPreviewHandles(child);
      for (const record of descendants)
        expect(await isCapturedWindowsProcessLive(record)).toBe(true);
      expect(child.exitCode).toBe(0);
      await expect(bindings.restore(false)).rejects.toThrow(
        "Worker processes must stop before restoring bindings",
      );
      expect(readFileSync(join(target.root, ".dev.vars"), "utf8")).toBe(staged);
      expect(existsSync(target.root)).toBe(true);
    } finally {
      releaseWorkerPreviewHandles(child);
      await waitUntil(() => child.exitCode !== null);
      await Promise.all([...descendants, ...(await descendantIdentities(target))].map(finiteExit));
      await bindings.restore(true);
      destroyFixture(target);
    }
  });

  test("a reused captured PID never authorizes termination of its new process identity", async () => {
    const target = await fixture("known", 1);
    const child = startPreview(target);
    let descendants: WindowsProcessRecord[] = [];
    try {
      descendants = await descendantIdentities(target);
      const current = descendants[0]!;
      const exited = { pid: current.pid, exitCode: 1, signalCode: null } as ChildProcess;
      await terminateProcessTree(exited, [{ ...current, createdAt: "2000-01-01T00:00:00.000Z" }]);
      expect(await isCapturedWindowsProcessLive(current)).toBe(true);
    } finally {
      child.stdin!.write("exit\n");
      await waitUntil(() => child.exitCode !== null);
      releaseWorkerPreviewHandles(child);
      await Promise.all([...descendants, ...(await descendantIdentities(target))].map(finiteExit));
      destroyFixture(target);
    }
  });

  test("unverified cleanup fails promptly after releasing only the runner's handles", async () => {
    const target = await fixture("known", 1);
    const moduleUrl = pathToFileURL(
      join(import.meta.dirname, "../../scripts/test-generated.ts"),
    ).href;
    const tx = new FsTransaction(target.root);
    await tx.write(
      "runner.mjs",
      `import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stopWorkerPreview, releaseWorkerPreviewHandles, workerPreviewFailureDetail } from ${JSON.stringify(moduleUrl)};
const child = spawn(process.execPath, ["preview.mjs"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
child.stdout.resume(); child.stderr.resume();
while (!existsSync(".leaf-ready")) await Bun.sleep(25);
child.stdin.write("exit\\n");
await new Promise((resolve) => child.once("exit", resolve));
try { await stopWorkerPreview(child); process.exitCode = 3; }
catch (error) { console.log(workerPreviewFailureDetail(error, "", [])); process.exitCode = 1; }
finally { releaseWorkerPreviewHandles(child); }
`,
    );
    await tx.commit();
    let descendants: WindowsProcessRecord[] = [];
    try {
      const result = spawnSync(process.execPath, ["runner.mjs"], {
        cwd: target.root,
        encoding: "utf8",
        timeout: 7_000,
        killSignal: "SIGKILL",
        windowsHide: true,
      });
      descendants = await descendantIdentities(target);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("exited before graceful shutdown began");
      expect(result.stdout).toContain("refusing unsafe PID-only descendant discovery");
      for (const record of descendants)
        expect(await isCapturedWindowsProcessLive(record)).toBe(true);
    } finally {
      const rootIdentity = await captureWindowsProcessIdentity(
        Number(readFileSync(join(target.root, ".root-ready"), "utf8")),
      );
      await Promise.all(
        [
          ...descendants,
          ...(await descendantIdentities(target)),
          ...(rootIdentity ? [rootIdentity] : []),
        ].map(finiteExit),
      );
      destroyFixture(target);
    }
  });
});
