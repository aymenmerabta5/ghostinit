// @allow-long 450: real wrapper and descendant processes exercise signal, lock, and executable-resolution boundaries
import { afterEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  cloudflarePlan,
  createConvexFixture,
  createWorkerFixture,
  destroyFixture,
  generatedContent,
  runFixture,
  testEnvironment,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";
import { resolveWindowsSystemExecutable } from "../helpers/process-tree.js";

const fixtures: RuntimeFixture[] = [];
const track = (fixture: RuntimeFixture): RuntimeFixture => (fixtures.push(fixture), fixture);
afterEach(() => {
  for (const fixture of fixtures.splice(0)) destroyFixture(fixture);
});

async function waitUntil(predicate: () => boolean, milliseconds = 15_000): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(25);
  expect(predicate()).toBe(true);
}

function processIsLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function startWrapper(fixture: RuntimeFixture, action: string, extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, [join(fixture.root, fixture.script), action], {
    cwd: fixture.cwd ?? fixture.root,
    env: testEnvironment({ ...fixture.environment, ...extra }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout!.on("data", (chunk) => (output += String(chunk)));
  child.stderr!.on("data", (chunk) => (output += String(chunk)));
  const exited = new Promise<number | null>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", resolveExit);
  });
  return { child, exited, output: () => output };
}

function installDescendantAdapter(fixture: RuntimeFixture, packageName: "vite" | "convex") {
  const packageRoot = join(fixture.root, "node_modules", packageName);
  const adapter = join(packageRoot, "index.mjs");
  const original = readFileSync(adapter, "utf8");
  const descendant = join(packageRoot, "descendant.mjs");
  writeFileSync(
    descendant,
    `import { writeFileSync } from "node:fs";
writeFileSync(".descendant-pid", String(process.pid));
process.on("SIGTERM", () => writeFileSync(".descendant-signal", "SIGTERM"));
process.on("SIGINT", () => writeFileSync(".descendant-signal", "SIGINT"));
setInterval(() => writeFileSync(".descendant-heartbeat", String(Date.now())), 30);
`,
  );
  writeFileSync(
    adapter,
    `import { spawn as spawnDescendant } from "node:child_process";
${original}
if (process.argv.includes("dev") || process.argv.includes("preview")) {
  const nested = spawnDescendant(process.execPath, [${JSON.stringify(descendant)}], { stdio: "inherit", windowsHide: true });
  writeFileSync(".runtime-pid", String(process.pid));
  process.on("SIGTERM", () => writeFileSync(".runtime-signal", "SIGTERM"));
  process.on("SIGINT", () => writeFileSync(".runtime-signal", "SIGINT"));
  setInterval(() => {}, 1000);
}
`,
  );
}

function installCleanupFailureTrigger(fixture: RuntimeFixture) {
  const path = join(fixture.root, fixture.script);
  const source = readFileSync(path, "utf8");
  const boundary = "const releaseEnvironmentLifecycleLock = acquireEnvironmentLifecycleLock(";
  const instrumented = source.replace(
    boundary,
    `
const cleanupFailureTrigger = setInterval(() => {
  if (!existsSync(".trigger-cleanup-failure")) return;
  clearInterval(cleanupFailureTrigger);
  process.env.SystemRoot = process.env.SYSTEMROOT = process.env.WINDIR = resolve(".missing-system-root");
  process.emit("SIGTERM");
}, 20);
cleanupFailureTrigger.unref();
${boundary}`,
  );
  expect(instrumented).not.toBe(source);
  writeFileSync(path, instrumented);
}

async function stopFixtureProcesses(fixture: RuntimeFixture, wrapper: ChildProcess) {
  const cwd = fixture.cwd ?? fixture.root;
  for (const name of [".runtime-pid", ".descendant-pid"]) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    const pid = Number(readFileSync(path, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 1 || !processIsLive(pid)) continue;
    if (process.platform === "win32") {
      spawnSync(resolveWindowsSystemExecutable("taskkill"), ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
  }
  if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
  await Bun.sleep(75);
}

describe("generated Worker process supervision", () => {
  test("case-variant recovery markers block both wrappers before launching subprocesses", () => {
    for (const name of [
      ".dev.vars.ghostinit-process-recovery-test",
      ".DEV.VARS.GHOSTINIT-PROCESS-RECOVERY-TEST",
    ]) {
      const worker = track(createWorkerFixture());
      writeFileSync(join(worker.root, name), "unreadable recovery evidence");
      const rejectedWorker = runFixture(worker, ["preview"]);
      expect(rejectedWorker.status).not.toBe(0);
      expect(rejectedWorker.stderr).toContain("Unverified child cleanup marker");
      expect(existsSync(join(worker.root, "events.jsonl"))).toBe(false);
      const plan = cloudflarePlan({ database: "convex" });
      const convex = track(
        createConvexFixture(
          generatedContent(plan, "scripts/cloudflare-convex.mjs"),
          "NEXT_PUBLIC_CONVEX_URL",
        ),
      );
      writeFileSync(join(convex.root, name), "unreadable recovery evidence");
      const rejectedConvex = runFixture(convex, ["bootstrap"]);
      expect(rejectedConvex.status).not.toBe(0);
      expect(rejectedConvex.stderr).toContain("Unverified child cleanup marker");
      expect(existsSync(join(convex.root, "convex-events.jsonl"))).toBe(false);
    }
  });

  for (const action of ["dev", "preview"] as const) {
    test.skipIf(process.platform === "win32")(
      `a parent-targeted SIGTERM stops the ${action} process group before releasing the lock`,
      async () => {
        const fixture = track(createWorkerFixture({ framework: "tanstack-start" }));
        installDescendantAdapter(fixture, "vite");
        const wrapper = startWrapper(fixture, action);
        const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
        try {
          await waitUntil(() => existsSync(join(fixture.root, ".descendant-heartbeat")));
          const runtimePid = Number(readFileSync(join(fixture.root, ".runtime-pid"), "utf8"));
          const record = JSON.parse(readFileSync(lockPath, "utf8"));
          expect(record.pid).toBe(wrapper.child.pid);
          expect(record.child.processGroup).toBeGreaterThan(1);
          expect(processIsLive(runtimePid)).toBe(true);
          wrapper.child.kill("SIGTERM");
          await waitUntil(
            () => wrapper.child.exitCode !== null || wrapper.child.signalCode !== null,
          );
          expect(await wrapper.exited, wrapper.output()).toBe(143);
          expect(readFileSync(join(fixture.root, ".descendant-signal"), "utf8")).toBe("SIGTERM");
          expect(existsSync(lockPath)).toBe(false);
          const heartbeat = readFileSync(join(fixture.root, ".descendant-heartbeat"), "utf8");
          await Bun.sleep(100);
          expect(readFileSync(join(fixture.root, ".descendant-heartbeat"), "utf8")).toBe(heartbeat);
          expect(runFixture(fixture, ["dry-run"]).status).toBe(0);
        } finally {
          await stopFixtureProcesses(fixture, wrapper.child);
        }
      },
    );
  }

  test.skipIf(process.platform !== "win32")(
    "Windows forced parent termination retains the runtime identity and blocks competing builds",
    async () => {
      const fixture = track(createWorkerFixture({ framework: "tanstack-start" }));
      installDescendantAdapter(fixture, "vite");
      const wrapper = startWrapper(fixture, "dev");
      const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
      try {
        await waitUntil(() => existsSync(join(fixture.root, ".descendant-heartbeat")));
        // Windows TerminateProcess bypasses JS handlers; no graceful cleanup is claimed.
        wrapper.child.kill("SIGTERM");
        await wrapper.exited;
        expect(existsSync(lockPath)).toBe(true);
        const record = JSON.parse(readFileSync(lockPath, "utf8"));
        expect(record.pid).toBe(wrapper.child.pid);
        expect(record.child.pid).toBeGreaterThan(1);
        const competing = runFixture(fixture, ["dry-run"]);
        expect(competing.status).not.toBe(0);
        expect(competing.stderr).toContain("Worker environment lock");
        expect(readFileSync(join(fixture.root, ".dev.vars"), "utf8")).toContain(
          "local-server-secret-value",
        );
        expect(wrapper.output()).not.toContain("local-server-secret-value");
      } finally {
        await stopFixtureProcesses(fixture, wrapper.child);
      }
    },
  );

  test.skipIf(process.platform !== "win32")(
    "unverifiable Windows cleanup retains the lock and child PID instead of reporting success",
    async () => {
      const fixture = track(createWorkerFixture({ framework: "tanstack-start" }));
      installDescendantAdapter(fixture, "vite");
      installCleanupFailureTrigger(fixture);
      const wrapper = startWrapper(fixture, "dev");
      try {
        await waitUntil(() => existsSync(join(fixture.root, ".descendant-heartbeat")));
        writeFileSync(join(fixture.root, ".trigger-cleanup-failure"), "trigger");
        await waitUntil(() => wrapper.child.exitCode !== null);
        expect(await wrapper.exited).not.toBe(0);
        expect(wrapper.output()).toContain("lock and child identity were retained");
        const record = JSON.parse(
          readFileSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"), "utf8"),
        );
        expect(record.child.pid).toBeGreaterThan(1);
        expect(runFixture(fixture, ["dry-run"]).status).not.toBe(0);
      } finally {
        await stopFixtureProcesses(fixture, wrapper.child);
      }
    },
  );

  test.skipIf(process.platform !== "win32")(
    "Convex validation failure terminates real descendants despite cwd and PATH executable shadows",
    async () => {
      const plan = cloudflarePlan({ mode: "single", database: "convex" });
      const fixture = track(
        createConvexFixture(
          generatedContent(plan, "scripts/cloudflare-convex.mjs"),
          "NEXT_PUBLIC_CONVEX_URL",
        ),
      );
      installDescendantAdapter(fixture, "convex");
      writeFileSync(
        join(fixture.root, ".dev.vars"),
        "CONVEX_DEPLOYMENT=dev:fixture-worker\nCONVEX_URL=https://other-worker.convex.cloud\n",
      );
      const system32 = dirname(resolveWindowsSystemExecutable("taskkill"));
      for (const name of ["taskkill.exe", "powershell.exe"]) {
        copyFileSync(join(system32, "where.exe"), join(fixture.root, name));
      }
      const wrapper = startWrapper(fixture, "dev", { PATH: fixture.root + ";" + process.env.PATH });
      try {
        await waitUntil(() => wrapper.child.exitCode !== null);
        expect(await wrapper.exited).not.toBe(0);
        expect(wrapper.output()).toContain("does not match the authoritative CONVEX_URL");
        expect(wrapper.output()).not.toContain("termination could not be verified");
        expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
        for (const name of [".runtime-pid", ".descendant-pid"]) {
          expect(existsSync(join(fixture.root, name))).toBe(true);
          expect(processIsLive(Number(readFileSync(join(fixture.root, name), "utf8")))).toBe(false);
        }
      } finally {
        await stopFixtureProcesses(fixture, wrapper.child);
      }
    },
  );
  test.skipIf(process.platform !== "win32")(
    "a late descendant whose captured Windows parent exited keeps the environment lock",
    async () => {
      const fixture = track(createWorkerFixture({ framework: "tanstack-start" }));
      const packageRoot = join(fixture.root, "node_modules/vite");
      const adapter = join(packageRoot, "index.mjs");
      const descendant = join(packageRoot, "late-descendant.mjs");
      writeFileSync(
        descendant,
        `import { writeFileSync } from "node:fs";
writeFileSync(".descendant-pid", String(process.pid));
setInterval(() => writeFileSync(".descendant-heartbeat", String(Date.now())), 30);
`,
      );
      writeFileSync(
        adapter,
        `import { spawn as spawnLate } from "node:child_process";
${readFileSync(adapter, "utf8")}
writeFileSync(".runtime-pid", String(process.pid));
let spawned = false;
setInterval(() => {
  if (!spawned && existsSync(".spawn-late-descendant")) {
    spawned = true;
    const child = spawnLate(process.execPath, [${JSON.stringify(descendant)}], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }
  if (spawned && existsSync(".descendant-heartbeat")) process.exit(0);
}, 20);
`,
      );
      const wrapper = startWrapper(fixture, "dev");
      const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
      try {
        await waitUntil(
          () =>
            existsSync(lockPath) &&
            Boolean(JSON.parse(readFileSync(lockPath, "utf8")).child?.createdAt),
        );
        writeFileSync(join(fixture.root, ".spawn-late-descendant"), "spawn");
        await waitUntil(() => wrapper.child.exitCode !== null);
        expect(await wrapper.exited).not.toBe(0);
        expect(wrapper.output()).toContain("cleanup could not be verified");
        expect(existsSync(lockPath)).toBe(true);
        const descendantPid = Number(readFileSync(join(fixture.root, ".descendant-pid"), "utf8"));
        expect(processIsLive(descendantPid)).toBe(true);
        expect(runFixture(fixture, ["dry-run"]).status).not.toBe(0);
      } finally {
        await stopFixtureProcesses(fixture, wrapper.child);
      }
    },
  );

  test.skipIf(process.platform !== "win32")(
    "a handled Convex termination failure records recovery without replacing a concurrent Worker lock",
    async () => {
      const plan = cloudflarePlan({ framework: "tanstack-start", database: "convex" });
      const worker = track(
        createWorkerFixture({
          framework: "tanstack-start",
          plan,
          devVars: "CONVEX_DEPLOYMENT=dev:fixture-worker\n",
        }),
      );
      const fixture = { root: worker.root, script: "scripts/cloudflare-convex.mjs" };
      installDescendantAdapter(fixture, "convex");
      installCleanupFailureTrigger(fixture);
      const wrapper = startWrapper(fixture, "dev");
      const lockPath = join(fixture.root, ".dev.vars.ghostinit-build-lock");
      const concurrentOwner = JSON.stringify({
        version: 1,
        pid: process.pid,
        owner: "concurrent-worker-owner",
      });
      try {
        await waitUntil(
          () => existsSync(join(fixture.root, ".descendant-heartbeat")) && !existsSync(lockPath),
        );
        writeFileSync(lockPath, concurrentOwner, { flag: "wx" });
        writeFileSync(join(fixture.root, ".trigger-cleanup-failure"), "trigger");
        await waitUntil(() => wrapper.child.exitCode !== null);
        expect(await wrapper.exited).not.toBe(0);
        expect(wrapper.output()).toContain("child recovery evidence was retained");
        expect(readFileSync(lockPath, "utf8")).toBe(concurrentOwner);
        const markers = readdirSync(fixture.root).filter((name) =>
          name.startsWith(".dev.vars.ghostinit-process-recovery-"),
        );
        expect(markers).toHaveLength(1);
        const marker = JSON.parse(readFileSync(join(fixture.root, markers[0]!), "utf8"));
        expect(marker.pid).toBe(wrapper.child.pid);
        expect(marker.child.pid).toBeGreaterThan(1);
        expect(runFixture(fixture, ["codegen"]).stderr).toMatch(
          /Unverified child cleanup marker|stale Convex temporary environment/,
        );
        const rejectedWorker = runFixture(worker, ["dev"], {
          CONVEX_DEPLOYMENT: "dev:fixture-worker",
          CONVEX_URL: "https://fixture-worker.convex.cloud",
          CONVEX_SITE_URL: "https://fixture-worker.convex.site",
          VITE_CONVEX_URL: "https://fixture-worker.convex.cloud",
        });
        expect(rejectedWorker.stderr).toMatch(
          /Unverified child cleanup marker|stale Convex temporary environment/,
        );
      } finally {
        await stopFixtureProcesses(fixture, wrapper.child);
      }
    },
  );
  test("a recovery-marker write failure still terminates the real Convex process tree", async () => {
    const plan = cloudflarePlan({ database: "convex" });
    const generated = generatedContent(plan, "scripts/cloudflare-convex.mjs");
    const boundary =
      '  writeFileSync(path, content, { encoding: "utf8", mode: 0o600, flag: "wx" });';
    const instrumented = generated.replace(
      boundary,
      '  throw new Error("injected recovery-marker write failure");',
    );
    expect(instrumented).not.toBe(generated);
    const fixture = track(createConvexFixture(instrumented, "NEXT_PUBLIC_CONVEX_URL"));
    installDescendantAdapter(fixture, "convex");
    writeFileSync(
      join(fixture.root, ".dev.vars"),
      "CONVEX_DEPLOYMENT=dev:fixture-worker\nCONVEX_URL=https://other-worker.convex.cloud\n",
    );
    const wrapper = startWrapper(fixture, "dev");
    try {
      await waitUntil(() => wrapper.child.exitCode !== null);
      expect(await wrapper.exited).not.toBe(0);
      expect(wrapper.output()).toContain("injected recovery-marker write failure");
      expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(false);
      const heartbeat = readFileSync(join(fixture.root, ".descendant-heartbeat"), "utf8");
      await Bun.sleep(100);
      expect(readFileSync(join(fixture.root, ".descendant-heartbeat"), "utf8")).toBe(heartbeat);
      expect(
        readdirSync(fixture.root).some((name) => name.startsWith(".dev.vars.ghostinit-convex-")),
      ).toBe(false);
    } finally {
      await stopFixtureProcesses(fixture, wrapper.child);
    }
  });
});
