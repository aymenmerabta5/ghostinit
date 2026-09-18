import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  assertLoopbackPortUnowned,
  isExactHealthPayload,
  reservePort,
  runCommand,
  spawnTracked,
  terminateProcessTree,
  waitForHealthyHttp,
  type RunningProcess,
} from "../integration/e2e-build-process.js";

const running: RunningProcess[] = [];

function track(process: RunningProcess): RunningProcess {
  running.push(process);
  return process;
}

function healthServer(port: number, hostname = "127.0.0.1"): RunningProcess {
  const source = `
const port = ${port};
Bun.serve({
  hostname: ${JSON.stringify(hostname)},
  port,
  fetch() {
    return Response.json({ status: "ok", time: new Date().toISOString() });
  },
});
console.log("health fixture listening at http://127.0.0.1:" + port);
`;
  return track(spawnTracked(process.execPath, ["-e", source], process.cwd()));
}

function nonListeningProcess(port: number): RunningProcess {
  const source = `
console.log("fake listener http://127.0.0.1:${port}");
setInterval(() => {}, 1_000);
`;
  return track(spawnTracked(process.execPath, ["-e", source], process.cwd()));
}

function detachedGrandchildHealthServer(port: number, hostname = "127.0.0.1"): RunningProcess {
  const server = `Bun.serve({ hostname: ${JSON.stringify(hostname)}, port: ${port}, fetch() {
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } });
  setTimeout(() => process.exit(0), 30_000);`;
  const supervise = (source: string) => `const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", ${JSON.stringify(source)}], { detached: true, stdio: "inherit" });
child.once("exit", () => process.exit(0));
process.on("SIGTERM", () => child.kill("SIGTERM"));
setTimeout(() => child.kill("SIGKILL"), 30_000);`;
  return track(spawnTracked(process.execPath, ["-e", supervise(supervise(server))], process.cwd()));
}

function delayedDetachedHealthServer(port: number): RunningProcess {
  const listener = `const server = Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch() {
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } });
  process.once("SIGTERM", () => setTimeout(() => { server.stop(true); process.exit(0); }, 2500));`;
  const supervisor = `const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", ${JSON.stringify(listener)}], { detached: true, stdio: "inherit" });
process.once("SIGTERM", () => {
  child.kill("SIGTERM");
  child.once("exit", () => process.exit(0));
});`;
  return track(spawnTracked(process.execPath, ["-e", supervisor], process.cwd()));
}

function orphanedDetachedHealthServer(port: number): RunningProcess {
  const listener = `Bun.serve({ hostname: "127.0.0.1", port: ${port}, fetch() {
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } });
  setTimeout(() => process.exit(0), 30000);`;
  const supervisor = `const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", ${JSON.stringify(listener)}], { detached: true, stdio: "inherit" });
child.unref();
setInterval(() => {}, 1000);`;
  return track(spawnTracked(process.execPath, ["-e", supervisor], process.cwd()));
}

afterEach(async () => {
  const failures: unknown[] = [];
  for (const process of running.splice(0).reverse()) {
    if (process.child.exitCode !== null || process.child.signalCode !== null) continue;
    try {
      await terminateProcessTree(process.child);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
});

describe("production E2E runtime evidence", () => {
  test("accepts only a fresh, canonical, exact health payload", () => {
    const now = Date.now();
    const time = new Date(now).toISOString();
    expect(isExactHealthPayload({ status: "ok", time }, now)).toBe(true);
    expect(isExactHealthPayload({ status: "ok", time, extra: true }, now)).toBe(false);
    expect(
      isExactHealthPayload({ status: "ok", time: new Date(now - 120_000).toISOString() }, now),
    ).toBe(false);
    expect(isExactHealthPayload({ status: "ok", time: String(now) }, now)).toBe(false);
    expect(isExactHealthPayload({ status: "healthy", time }, now)).toBe(false);
  });

  test("ties an exact health response to the spawned process tree", async () => {
    const port = await reservePort();
    await assertLoopbackPortUnowned(port);
    const server = healthServer(port);
    const result = await waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 10_000);

    expect(result.response.status).toBe(200);
    expect(result.payload.status).toBe("ok");
  });

  test("ties a detached grandchild listener to its live ancestor tree", async () => {
    const port = await reservePort();
    await assertLoopbackPortUnowned(port);
    const server = detachedGrandchildHealthServer(port);
    const result = await waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 5_000);
    expect(result.response.status).toBe(200);
    await terminateProcessTree(server.child);
    await assertLoopbackPortUnowned(port);
  });

  test.skipIf(process.platform === "win32")(
    "allows an owned supervisor to finish delayed detached-listener cleanup",
    async () => {
      const port = await reservePort();
      const server = delayedDetachedHealthServer(port);
      await waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 5_000);

      await terminateProcessTree(server.child);
      await assertLoopbackPortUnowned(port);
    },
  );

  test.skipIf(process.platform !== "linux")(
    "drains a detached listener orphaned outside the spawned process group",
    async () => {
      const port = await reservePort();
      const server = orphanedDetachedHealthServer(port);
      await waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 5_000);

      await terminateProcessTree(server.child);
      await assertLoopbackPortUnowned(port);
    },
  );

  test("rejects an owned wildcard listener despite an exact health response", async () => {
    const port = await reservePort();
    await assertLoopbackPortUnowned(port);
    const server = healthServer(port, "0.0.0.0");
    let status = 0;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1_000),
        });
        status = response.status;
        await response.body?.cancel();
        if (status === 200) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(status).toBe(200);
    await expect(
      waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 1_000),
    ).rejects.toThrow("outside the spawned process tree");
  });

  test("rejects a valid response owned by an unrelated process", async () => {
    const port = await reservePort();
    await assertLoopbackPortUnowned(port);
    const server = healthServer(port);
    await waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 10_000);
    const unrelated = nonListeningProcess(port);

    await expect(
      waitForHealthyHttp(unrelated, `http://127.0.0.1:${port}/api/health`, 1_000),
    ).rejects.toThrow("outside the spawned process tree");
  });

  test.skipIf(process.platform !== "win32" && process.platform !== "darwin")(
    "uses system listener evidence despite working-directory and PATH executable shadows",
    async () => {
      const port = await reservePort();
      const server = healthServer(port);
      await waitForHealthyHttp(server, `http://127.0.0.1:${port}/api/health`, 10_000);
      const unrelated = nonListeningProcess(port);
      const root = mkdtempSync(join(tmpdir(), "ghostinit-listener-tool-shadow-"));
      const marker = join(root, "shadow-was-executed");
      const command = process.platform === "win32" ? "powershell" : "lsof";
      try {
        if (process.platform === "win32") {
          // This valid executable cannot answer a PowerShell ownership query.
          // Both successful ownership and unrelated-owner rejection must still work.
          for (const name of ["powershell.exe", "pwsh.exe"]) {
            copyFileSync(join(process.env.SystemRoot!, "System32", "where.exe"), join(root, name));
          }
        } else {
          writeFileSync(
            join(root, "lsof"),
            '#!/bin/sh\n: > "$GHOSTINIT_SHADOW_MARKER"\nprintf "p%s\\nn127.0.0.1:%s\\n" "$GHOSTINIT_SHADOW_PID" "$GHOSTINIT_SHADOW_PORT"\n',
            { mode: 0o755 },
          );
        }
        const moduleUrl = new URL("../integration/e2e-build-process.ts", import.meta.url).href;
        const source = `
import { productionListenerOwnedByProcessTree } from ${JSON.stringify(moduleUrl)};
import { realpathSync } from "node:fs";
const shadow = Bun.which(${JSON.stringify(command)});
if (!shadow || realpathSync(shadow) !== realpathSync(${JSON.stringify(join(root, command + (process.platform === "win32" ? ".exe" : "")))})) {
  throw new Error("The regression fixture did not shadow the listener utility");
}
console.log(JSON.stringify({
  owned: productionListenerOwnedByProcessTree({ pid: ${server.child.pid} }, ${port}),
  unrelated: productionListenerOwnedByProcessTree({ pid: ${unrelated.child.pid} }, ${port}),
}));
`;
        const result = await runCommand(process.execPath, ["-e", source], root, 30_000, {
          ...process.env,
          PATH: `${root}${delimiter}${process.env.PATH ?? ""}`,
          GHOSTINIT_SHADOW_MARKER: marker,
          GHOSTINIT_SHADOW_PID: String(unrelated.child.pid),
          GHOSTINIT_SHADOW_PORT: String(port),
        });
        expect(result.error).toBeUndefined();
        expect(result.timedOut).toBe(false);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({ owned: true, unrelated: false });
        expect(existsSync(marker)).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
