import { describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { firstErrors, stopWorkerPreview } from "../../scripts/test-generated.js";
import {
  cloudflarePlan,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  readEvents,
  runFixture,
  testEnvironment,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";
import {
  assertProcessTreeExited,
  captureWindowsProcessIdentity,
  captureWindowsProcessTree,
  isCapturedWindowsProcessLive,
  terminateProcessTree,
  type WindowsProcessRecord,
} from "../helpers/process-tree.js";
import { stageWorkerBindingFiles } from "../helpers/worker-binding-files.js";

async function waitUntil(predicate: () => boolean, milliseconds = 20_000): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(25);
  expect(predicate()).toBe(true);
}

async function awaitFiniteWindowsExit(captured: WindowsProcessRecord): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (await isCapturedWindowsProcessLive(captured)) {
    if (Date.now() >= deadline) {
      throw new Error("Finite late preview child did not self-exit; retaining fixture");
    }
    await Bun.sleep(100);
  }
}

function previewFixture(framework: "nextjs" | "tanstack-start", mode: "monorepo" | "single") {
  const plan = cloudflarePlan({ framework, mode });
  const fixture = createWorkerFixture({ framework, plan });
  const appRoot = fixture.cwd ?? fixture.root;
  const packagePath = join(appRoot, "package.json");
  const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
  const generated = JSON.parse(
    generatedContent(plan, mode === "single" ? "package.json" : "apps/web/package.json"),
  );
  manifest.scripts = { ...manifest.scripts, preview: generated.scripts.preview };
  writeFileSync(packagePath, `${JSON.stringify(manifest)}\n`);
  const adapterPath = join(
    fixture.root,
    "node_modules",
    framework === "nextjs" ? "@opennextjs/cloudflare" : "vite",
    "index.mjs",
  );
  const original = readFileSync(adapterPath, "utf8");
  writeFileSync(
    adapterPath,
    `${original}
if (action === "preview" || action === "dev") {
  const { spawn } = await import("node:child_process");
  const nested = spawn(process.execPath, ["-e", 'const fs = require("node:fs"); fs.writeFileSync(".descendant-ready", String(process.pid)); setInterval(() => fs.writeFileSync(".descendant-heartbeat", String(Date.now())), 25); setTimeout(() => process.exit(0), 30000);'], { stdio: "ignore", windowsHide: true });
  writeFileSync(".runtime-ready", String(process.pid));
  process.stdin.on("end", () => writeFileSync(".adapter-input-ended", "ended"));
  process.stdin.resume();
  setInterval(() => {}, 1000);
  setTimeout(() => process.exit(0), 30000);
}
`,
  );
  return fixture;
}

function startPreview(fixture: RuntimeFixture, control = true) {
  const child = spawn(
    process.execPath,
    ["run", "preview", "--", ...(control ? ["--ghostinit-stop-on-stdin-end"] : [])],
    {
      cwd: fixture.cwd ?? fixture.root,
      env: testEnvironment(fixture.environment),
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout!.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr!.on("data", (chunk) => {
    output += String(chunk);
  });
  child.on("error", () => {});
  return { child, output: () => output };
}

async function disposeVerifiedFixture(
  fixture: RuntimeFixture,
  child: ChildProcess,
  captured: readonly WindowsProcessRecord[],
  independentlyVerifiedFailure = false,
) {
  // Never delete an uncertain workspace just because the test assertion failed.
  if (!independentlyVerifiedFailure) await stopWorkerPreview(child);
  await terminateProcessTree(child, captured);
  await assertProcessTreeExited(child, captured);
  destroyFixture(fixture);
}

describe("Worker preview automation shutdown", () => {
  for (const [framework, mode] of [
    ["nextjs", "single"],
    ["tanstack-start", "monorepo"],
  ] as const) {
    test(`${framework} ${mode}: bun run preview joins one EOF cleanup before restoring bindings`, async () => {
      const fixture = previewFixture(framework, mode);
      const appRoot = fixture.cwd ?? fixture.root;
      const paths = mode === "single" ? [".dev.vars"] : [".dev.vars", "apps/web/.dev.vars"];
      const entries = paths.map((path) => ({
        path,
        original: readFileSync(join(fixture.root, path), "utf8"),
        content: "SERVER_SECRET=fixture-preview-value\n",
      }));
      const binding = await stageWorkerBindingFiles(realpathSync.native(fixture.root), entries);
      const preview = startPreview(fixture);
      let captured: WindowsProcessRecord[] = [];
      try {
        await waitUntil(() => existsSync(join(appRoot, ".descendant-heartbeat")));
        expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(true);
        captured = await captureWindowsProcessTree(preview.child);
        const stopping = stopWorkerPreview(preview.child);
        expect(stopWorkerPreview(preview.child)).toBe(stopping);
        await stopping;
        await assertProcessTreeExited(preview.child, captured);
        expect(preview.child.exitCode).toBe(0);
        expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
        const heartbeat = readFileSync(join(appRoot, ".descendant-heartbeat"), "utf8");
        await Bun.sleep(100);
        expect(readFileSync(join(appRoot, ".descendant-heartbeat"), "utf8")).toBe(heartbeat);
        expect(
          readEvents(fixture.root)
            .filter(({ action }) => action === "preview")
            .every(({ args }) => !args.includes("--ghostinit-stop-on-stdin-end")),
        ).toBe(true);
        await binding.restore(true);
        for (const entry of entries)
          expect(readFileSync(join(fixture.root, entry.path), "utf8")).toBe(entry.original);
        expect(runFixture(fixture, ["dry-run"]).status).toBe(0);
      } finally {
        await disposeVerifiedFixture(fixture, preview.child, captured);
      }
    });
  }

  test("EOF queued during the preview build stops its eventual runtime", async () => {
    const fixture = previewFixture("tanstack-start", "single");
    writeFileSync(join(fixture.root, ".delay-adapter"), "5000");
    const preview = startPreview(fixture);
    let captured: WindowsProcessRecord[] = [];
    try {
      await waitUntil(() => existsSync(join(fixture.root, ".adapter-paused")));
      captured = await captureWindowsProcessTree(preview.child);
      expect(existsSync(join(fixture.root, ".runtime-ready"))).toBe(false);
      await stopWorkerPreview(preview.child);
      await assertProcessTreeExited(preview.child, captured);
      expect(preview.child.exitCode).toBe(0);
      expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
    } finally {
      await disposeVerifiedFixture(fixture, preview.child, captured);
    }
  });

  test.skipIf(process.platform !== "win32")(
    "forced fallback preserves the lease and never becomes successful cleanup",
    async () => {
      const fixture = previewFixture("nextjs", "single");
      const preview = startPreview(fixture, false);
      let captured: WindowsProcessRecord[] = [];
      try {
        await waitUntil(() => existsSync(join(fixture.root, ".descendant-heartbeat")));
        captured = await captureWindowsProcessTree(preview.child);
        await expect(stopWorkerPreview(preview.child, 100)).rejects.toThrow(
          "graceful shutdown timed out",
        );
        await assertProcessTreeExited(preview.child, captured);
        expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(true);
        const competing = runFixture(fixture, ["dry-run"]);
        expect(competing.status).not.toBe(0);
        expect(competing.stderr).toContain("Worker environment lock");
      } finally {
        await disposeVerifiedFixture(fixture, preview.child, captured, true);
      }
    },
  );

  test.skipIf(process.platform !== "win32")(
    "late descendants created after EOF are rejected without unsafe PID-only termination",
    async () => {
      const fixture = createWorkerFixture({ framework: "tanstack-start" });
      const manifestPath = join(fixture.root, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.scripts.preview = "bun scripts/cloudflare.mjs preview";
      writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
      // Deliberately replace the trusted generated wrapper to exercise the outer
      // verifier's conservative boundary with a finite, independently checked child.
      writeFileSync(
        join(fixture.root, fixture.script),
        `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
writeFileSync(".preview-root-ready", String(process.pid));
process.stdin.once("end", () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 15000)"], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  writeFileSync(".late-descendant-pid", String(child.pid));
  setTimeout(() => process.exit(0), 50);
});
process.stdin.resume();
setTimeout(() => process.exit(0), 30000);
`,
      );
      const preview = startPreview(fixture);
      let captured: WindowsProcessRecord[] = [];
      try {
        await waitUntil(() => existsSync(join(fixture.root, ".preview-root-ready")));
        captured = await captureWindowsProcessTree(preview.child);
        await expect(stopWorkerPreview(preview.child)).rejects.toThrow(
          "Unverified late Windows preview descendants",
        );
        const late = await captureWindowsProcessIdentity(
          Number(readFileSync(join(fixture.root, ".late-descendant-pid"), "utf8")),
        );
        expect(late).toBeDefined();
        expect(await isCapturedWindowsProcessLive(late!)).toBe(true);
      } finally {
        const path = join(fixture.root, ".late-descendant-pid");
        if (existsSync(path)) {
          const late = await captureWindowsProcessIdentity(Number(readFileSync(path, "utf8")));
          if (late) {
            await awaitFiniteWindowsExit(late);
          }
        }
        await disposeVerifiedFixture(fixture, preview.child, captured, true);
      }
    },
  );

  test("the stop control is explicit, restricted to runtime actions, and value-free binding failures remain visible", () => {
    const fixture = createWorkerFixture({ framework: "tanstack-start" });
    try {
      for (const args of [
        ["build", "--ghostinit-stop-on-stdin-end"],
        ["preview", "--ghostinit-stop-on-stdin-end=true"],
        ["preview", "--ghostinit-stop-on-stdin-end", "--ghostinit-stop-on-stdin-end"],
      ]) {
        expect(runFixture(fixture, args).status).not.toBe(0);
      }
      expect(
        firstErrors(
          "Worker binding restoration failed; recovery evidence was retained at fixture-path.",
        ),
      ).toContain("recovery evidence was retained at fixture-path");
    } finally {
      destroyFixture(fixture);
    }
  });
});
