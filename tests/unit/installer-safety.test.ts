import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync as spawnProcessSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runtime } from "../../packages/versions/src/index";
import {
  advanceWindowsJobControllerState,
  buildInstallEnv,
  discoverCanonicalBunExecutable,
  INSTALL_TIMEOUT_MS,
  InstallerContainmentUnavailableError,
  InstallerInterruptedError,
  resolveCanonicalBunExecutable,
  runInstallerCommand,
  runProjectInstall,
  type InstallerDependencies,
} from "../../src/commands/create/installer";
import { resolveCreateConfig } from "../../src/commands/create/resolution";
import type { GlobalOptions } from "../../src/commands/types";
import { FsRollbackError, type FsTransaction } from "../../src/lib/fs";
import { Logger } from "../../src/lib/logger";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function forceKillProcess(pid: number | undefined): void {
  if (pid === undefined || !Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnProcessSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
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
      // Already stopped by the production cleanup path.
    }
  }
}

function forceKill(pidFile: string): void {
  if (!existsSync(pidFile)) return;
  forceKillProcess(Number.parseInt(readFileSync(pidFile, "utf8"), 10));
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessClose(
  child: ChildProcess,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return await new Promise((resolveClose, rejectClose) => {
    const timer = setTimeout(
      () => rejectClose(new Error("POSIX signal harness did not exit after verified cleanup")),
      timeoutMs,
    );
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveClose({ code, signal });
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectClose(error);
    });
  });
}

function installerTreeScript(
  marker: string,
  pidFile: string,
  exitCode?: number,
  ignoreSigterm = false,
  detachedDescendant = false,
): string {
  const writer = `const fs = require("node:fs"); ${ignoreSigterm ? 'process.on("SIGTERM", () => {});' : ""} setInterval(() => fs.writeFileSync(${JSON.stringify(marker)}, String(Date.now())), 40);`;
  return `const fs = require("node:fs");
const { spawn } = require("node:child_process");
const descendant = spawn(process.execPath, ["-e", ${JSON.stringify(writer)}], { stdio: "ignore", windowsHide: true, detached: ${String(detachedDescendant)} });
${detachedDescendant ? "descendant.unref();" : ""}
fs.writeFileSync(${JSON.stringify(pidFile)}, String(descendant.pid));
${exitCode === undefined ? "setInterval(() => {}, 1000);" : `setTimeout(() => process.exit(${exitCode}), 120);`}`;
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${path}`);
    await Bun.sleep(20);
  }
}

async function assertNoWritesAfterCleanup(
  exitCode?: number,
  parentSignal?: "SIGINT" | "SIGTERM",
  ignoreSigterm = false,
  detachedDescendant = false,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-tree-"));
  roots.push(root);
  const marker = join(root, "late-write.txt");
  const pidFile = join(root, "descendant.pid");
  const node = Bun.which("node");
  if (node === null) throw new Error("node executable was not found");
  const signalSource = new EventEmitter();
  let command: Promise<void> | undefined;

  try {
    command = runInstallerCommand({
      command: node,
      argv: [
        "-e",
        installerTreeScript(marker, pidFile, exitCode, ignoreSigterm, detachedDescendant),
      ],
      cwd: root,
      label: "installer safety probe",
      timeoutMs: exitCode === undefined && parentSignal === undefined ? 250 : 60_000,
      signalSource,
    });
    if (parentSignal !== undefined) {
      await waitForFile(pidFile);
      signalSource.emit(parentSignal);
      await expect(command).rejects.toThrow(`interrupted by ${parentSignal}`);
    } else if (exitCode === undefined) {
      const failure = await command.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(InstallerContainmentUnavailableError);
      expect((failure as Error).message).toContain("installer safety probe timed out after 1s");
    } else if (exitCode === 0) await expect(command).resolves.toBeUndefined();
    else await expect(command).rejects.toThrow(`exited with code ${exitCode}`);

    // A descendant may have written while termination was in progress. Removing
    // the marker after the promise settles turns any reappearance into proof that
    // runInstallerCommand returned before the whole tree was actually stopped.
    rmSync(marker, { force: true });
    await Bun.sleep(350);
    expect(existsSync(marker)).toBe(false);
    if (detachedDescendant && process.platform !== "win32") {
      const pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
      expect(processIsAlive(pid)).toBe(false);
    }
    expect(signalSource.listenerCount("SIGINT")).toBe(0);
    expect(signalSource.listenerCount("SIGTERM")).toBe(0);
  } finally {
    if (
      command !== undefined &&
      (signalSource.listenerCount("SIGINT") > 0 || signalSource.listenerCount("SIGTERM") > 0)
    ) {
      signalSource.emit("SIGTERM");
      await command.catch(() => undefined);
    }
    forceKill(pidFile);
  }
}

function fixture() {
  const result = resolveCreateConfig({
    name: "installer-safety",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    billing: [],
    features: [],
    database: "postgres",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "saas",
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  return result;
}

function options(root: string): GlobalOptions {
  return {
    cwd: root,
    json: false,
    yes: true,
    force: true,
    dryRun: false,
    noInstall: false,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
  };
}

describe("installer process-tree and init isolation", () => {
  test("uses the current pinned Bun executable and preserves PATH environment spelling", () => {
    expect(Bun.version).toBe(runtime.bun);
    expect(resolveCanonicalBunExecutable()).toBe(process.execPath);
    expect(INSTALL_TIMEOUT_MS).toBe(900_000);

    const candidateRoot = resolve(tmpdir(), "candidate-root");
    const env = buildInstallEnv(candidateRoot, {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: "D:\\BunCache\\install\\cache",
      BUN_CONFIG_PATH: "D:\\untrusted-bunfig.toml",
      BUN_CONFIG_REGISTRY: "https://registry.example.invalid/",
      npm_config_registry: "https://registry.example.invalid/",
    });
    for (const [key, value] of Object.entries(process.env)) {
      if (key.toUpperCase() === "PATH" || key.toUpperCase() === "PATHEXT") {
        expect(env[key]).toBe(value);
      }
    }
    expect(env.PWD).toBe(candidateRoot);
    expect(env.BUN_INSTALL_CACHE_DIR).toBe("D:\\BunCache\\install\\cache");
    expect(env.NPM_CONFIG_CACHE).toBeUndefined();
    expect(env.BUN_CONFIG_PATH).toBeUndefined();
    expect(env.BUN_CONFIG_REGISTRY).toBeUndefined();
    expect(env.npm_config_registry).toBeUndefined();

    const discovered = discoverCanonicalBunExecutable();
    expect(discovered).toBeDefined();
    const version = spawnProcessSync(discovered!, ["--version"], { encoding: "utf8" });
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(runtime.bun);

    const stale = "E:\\BunCache\\bin\\bun.exe";
    if (process.platform === "win32" && existsSync(stale)) {
      const pathEntry = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH");
      expect(pathEntry).toBeDefined();
      const staleFirst = { ...process.env };
      staleFirst[pathEntry!] = `E:\\BunCache\\bin${delimiter}${process.env[pathEntry!] ?? ""}`;
      expect(discoverCanonicalBunExecutable(staleFirst)?.toLowerCase()).not.toBe(
        stale.toLowerCase(),
      );
    }
  });

  test("skips an earlier wrong-version PATH candidate on every host platform", () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-bun-discovery-"));
    roots.push(root);
    const staleDirectory = join(root, "stale");
    const currentDirectory = join(root, "current");
    mkdirSync(staleDirectory);
    mkdirSync(currentDirectory);
    const executableName = process.platform === "win32" ? "bun.exe" : "bun";
    const stale = resolve(staleDirectory, executableName);
    const current = resolve(currentDirectory, executableName);
    writeFileSync(stale, "test candidate");
    writeFileSync(current, "test candidate");
    const environment: NodeJS.ProcessEnv =
      process.platform === "win32"
        ? {
            Path: `${staleDirectory}${delimiter}${currentDirectory}`,
            PATHEXT: ".EXE",
          }
        : {
            PATH: `${staleDirectory}${delimiter}${currentDirectory}`,
          };

    const discovered = discoverCanonicalBunExecutable(environment, {
      version: (path) => (path === stale ? "1.3.14" : path === current ? runtime.bun : undefined),
      canonicalize: (path) => path,
      windowsShimTarget: () => undefined,
    });
    expect(discovered).toBe(current);
  });

  test("Windows ancestry capture rejects PID-reuse edges before tree termination", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/commands/create/installer.ts"),
      "utf8",
    );
    expect(source).toContain("$processCreatedAt -ge $parentCreatedAt");
    expect(source).toContain("Get-Process -Id $processId -ErrorAction Stop");
    expect(source).toContain("[math]::Abs($createdAt - $expected) -le 10000");
    expect(source).toContain("[void]$process.Handle");
    expect(source).toContain("$entry.Process.Kill()");
    expect(source).not.toContain("Stop-Process -Id");
  });

  test("Windows Job Object admission uses the pinned Bun FFI controller over private IPC", () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/commands/create/installer.ts"),
      "utf8",
    );
    expect(source).toContain('await import("bun:ffi")');
    expect(source).toContain('CreateJobObjectW: { args: ["ptr", "ptr"], returns: "u64" }');
    expect(source).toContain('OpenProcess: { args: ["u32", "i32", "u32"], returns: "u64" }');
    expect(source).toContain("AssignProcessToJobObject");
    expect(source).toContain("JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE");
    expect(source).toContain('["-e", windowsJobControllerSource(pid)]');
    expect(source).toContain('stdio: ["ignore", "ignore", "pipe", "ipc"]');
    expect(source).toContain('process.once("disconnect"');
    expect(source).toContain('process.once("disconnect", () => process.exit(1))');
    expect(source).not.toContain("Add-Type -TypeDefinition");
  });

  test("Windows Job Object controller IPC rejects malformed and out-of-order frames", () => {
    expect(advanceWindowsJobControllerState("starting", { type: "ghostinit:job-ready" })).toBe(
      "ready",
    );
    expect(advanceWindowsJobControllerState("terminating", { type: "ghostinit:job-stopped" })).toBe(
      "stopped",
    );
    expect(() => advanceWindowsJobControllerState("starting", { type: "unknown" })).toThrow(
      "invalid IPC data",
    );
    expect(() =>
      advanceWindowsJobControllerState("starting", { type: "ghostinit:job-stopped" }),
    ).toThrow("while starting");
    expect(() =>
      advanceWindowsJobControllerState("ready", { type: "ghostinit:job-ready" }),
    ).toThrow("while ready");
  });

  test("a Node-hosted installer delegates Windows Job Object ownership to pinned Bun", async () => {
    if (process.platform !== "win32") return;
    const node = Bun.which("node");
    if (node === null) throw new Error("node executable was not found");
    const bundleRoot = mkdtempSync(
      join(resolve(import.meta.dir, "../../node_modules"), ".ghostinit-installer-node-"),
    );
    roots.push(bundleRoot);
    const build = await Bun.build({
      entrypoints: [resolve(import.meta.dir, "../../src/commands/create/installer.ts")],
      outdir: bundleRoot,
      target: "node",
      format: "esm",
      external: ["oxc-parser", "oxfmt"],
      naming: "[name].mjs",
    });
    expect(build.success).toBe(true);
    const bundle = build.outputs.find(({ kind }) => kind === "entry-point");
    if (!bundle) throw new Error("Installer Node-host test bundle was not emitted");
    const harness = `
import { runInstallerCommand } from ${JSON.stringify(pathToFileURL(bundle.path).href)};
await runInstallerCommand({
  command: process.execPath,
  argv: ["-e", "process.exit(0)"],
  cwd: ${JSON.stringify(bundleRoot)},
  label: "Node-hosted installer controller probe",
  timeoutMs: 15000,
});`;
    const outcome = spawnProcessSync(node, ["--input-type=module", "-e", harness], {
      cwd: bundleRoot,
      encoding: "utf8",
      env: process.env,
      timeout: 30_000,
      windowsHide: true,
    });
    expect(outcome.error).toBeUndefined();
    expect(outcome.signal, outcome.stderr).toBeNull();
    expect(outcome.status, outcome.stderr).toBe(0);
  }, 60_000);

  test("timeout waits for the complete descendant tree before rejecting", async () => {
    await assertNoWritesAfterCleanup();
  }, 90_000);

  test("non-zero exit waits for the complete descendant tree before rejecting", async () => {
    await assertNoWritesAfterCleanup(7);
  }, 90_000);

  test("successful lifecycle command cannot leave a mutating daemon behind", async () => {
    await assertNoWritesAfterCleanup(0);
  }, 90_000);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    test(`${signal} waits for the complete descendant tree before rejecting`, async () => {
      await assertNoWritesAfterCleanup(undefined, signal);
    }, 90_000);
  }

  test("force-terminates a descendant that ignores graceful SIGTERM", async () => {
    await assertNoWritesAfterCleanup(undefined, "SIGTERM", true);
  }, 120_000);

  test("POSIX cleanup drains a descendant that creates a detached process group", async () => {
    if (process.platform === "win32") return;
    await assertNoWritesAfterCleanup(undefined, undefined, false, true);
  }, 120_000);

  test("a real POSIX SIGTERM reaches the parent handler and drains its detached scope", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-posix-signal-"));
    roots.push(root);
    const marker = join(root, "late-write.txt");
    const pidFile = join(root, "descendant.pid");
    const node = Bun.which("node");
    if (node === null) throw new Error("node executable was not found");
    const installerUrl = pathToFileURL(
      resolve(import.meta.dir, "../../src/commands/create/installer.ts"),
    ).href;
    const harnessSource = `
const { runInstallerCommand } = await import(${JSON.stringify(installerUrl)});
try {
  await runInstallerCommand(${JSON.stringify({
    command: node,
    argv: ["-e", installerTreeScript(marker, pidFile, undefined, false, true)],
    cwd: root,
    label: "POSIX parent signal probe",
    timeoutMs: 60_000,
  })});
  process.exitCode = 2;
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("interrupted by SIGTERM")) {
    console.error(error);
    process.exitCode = 3;
  }
}`;
    const harness = spawn(process.execPath, ["-e", harnessSource], {
      cwd: root,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    harness.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    try {
      await waitForFile(pidFile);
      const descendantPid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
      expect(harness.kill("SIGTERM")).toBe(true);
      const exit = await waitForProcessClose(harness, 60_000);
      expect(exit.signal, stderr).toBeNull();
      expect(exit.code, stderr).toBe(0);
      rmSync(marker, { force: true });
      await Bun.sleep(350);
      expect(existsSync(marker)).toBe(false);
      expect(processIsAlive(descendantPid)).toBe(false);
    } finally {
      if (harness.exitCode === null && harness.signalCode === null) forceKillProcess(harness.pid);
      forceKill(pidFile);
    }
  }, 120_000);

  test("forced init runs install, format, and verification only in a private candidate", async () => {
    const resolved = fixture();
    const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-init-"));
    roots.push(root);
    const userFile = join(root, "user-owned.ts");
    const originalUserContent = "export   const userOwned = true\n";
    writeFileSync(userFile, originalUserContent);

    const toolRoots: string[] = [];
    const transactionRoots: string[] = [];
    const transactionWrites = new Map<string, Map<string, string>>();
    const contentByAbsolutePath = new Map<string, string>();
    let generatedFormatPaths: readonly string[] = [];
    let released = false;
    const result = await runProjectInstall(
      {
        projectName: resolved.config.name,
        projectRoot: root,
        desiredConfig: resolved.desiredConfig,
        resolvedConfig: resolved.resolvedConfig,
        options: options(root),
        noInstall: false,
      },
      {
        checkGitStatus: async (checkedRoot) => {
          expect(checkedRoot).toBe(root);
          return { isRepo: false, dirty: false, untracked: [], modified: [] };
        },
        assertCleanGit: () => undefined,
        acquireLock: async (lockedRoot) => {
          expect(lockedRoot).toBe(root);
          return {
            owner: { pid: process.pid, startTime: new Date().toISOString() },
            release: async () => {
              released = true;
            },
          };
        },
        createTransaction: (transactionRoot) => {
          transactionRoots.push(transactionRoot);
          const writes = new Map<string, string>();
          transactionWrites.set(transactionRoot, writes);
          return {
            write: async (path: string, content: string) => {
              writes.set(path, content);
              contentByAbsolutePath.set(join(transactionRoot, ...path.split("/")), content);
            },
            commit: async () => ({ written: [...writes.keys()] }),
            rollback: async () => ({ success: true, restored: [], removed: [], failures: [] }),
          } as unknown as FsTransaction;
        },
        readFile: async (path) => contentByAbsolutePath.get(String(path)) ?? "",
        loadState: async () => undefined,
        saveState: async () => undefined,
        createSecretMaterializer: () => ({
          materialize: async (operations) => ({
            references: operations.map(({ reference }) => reference),
          }),
        }),
        runInstall: async (candidateRoot) => {
          toolRoots.push(candidateRoot);
          expect(candidateRoot).not.toBe(root);
          expect(existsSync(join(candidateRoot, "user-owned.ts"))).toBe(false);
          writeFileSync(join(candidateRoot, "bun.lock"), "candidate-only lock\n");
        },
        runFormat: async (candidateRoot, _runtime, paths) => {
          toolRoots.push(candidateRoot);
          generatedFormatPaths = paths;
          expect(paths).not.toContain(".");
          expect(paths).not.toContain("user-owned.ts");
          writeFileSync(join(candidateRoot, "formatter-side-effect.ts"), "changed\n");
        },
        runVerification: async (candidateRoot) => {
          toolRoots.push(candidateRoot);
          expect(existsSync(join(candidateRoot, "user-owned.ts"))).toBe(false);
        },
      } as unknown as Partial<InstallerDependencies>,
    );

    expect(result.installFailed).toBe(false);
    expect(toolRoots).toHaveLength(3);
    expect(new Set(toolRoots).size).toBe(1);
    expect(toolRoots[0]).not.toBe(root);
    expect(existsSync(toolRoots[0]!)).toBe(false);
    expect(transactionRoots).toEqual([toolRoots[0], root]);
    expect(generatedFormatPaths).toContain("package.json");
    expect(readFileSync(userFile, "utf8")).toBe(originalUserContent);
    expect(existsSync(join(root, "bun.lock"))).toBe(false);
    expect(existsSync(join(root, "formatter-side-effect.ts"))).toBe(false);
    expect(transactionWrites.get(root)?.has("package.json")).toBe(true);
    expect(released).toBe(true);
  }, 30_000);

  test("surfaces the original install error together with an incomplete rollback", async () => {
    const resolved = fixture();
    const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-rollback-"));
    roots.push(root);
    const installFailure = new Error("injected install failure");
    const rollbackFailure = new FsRollbackError("injected rollback failure", {
      success: false,
      restored: [],
      removed: [],
      failures: [
        {
          path: "package.json",
          action: "remove",
          reason: "content-changed",
          message: "package.json changed after commit",
        },
      ],
    });
    const transaction = {
      write: async () => undefined,
      commit: async () => ({ written: ["package.json"] }),
      rollback: async () => {
        throw rollbackFailure;
      },
    } as unknown as FsTransaction;

    let caught: unknown;
    try {
      await runProjectInstall(
        {
          projectName: resolved.config.name,
          projectRoot: root,
          desiredConfig: resolved.desiredConfig,
          resolvedConfig: resolved.resolvedConfig,
          options: options(root),
          noInstall: false,
        },
        {
          checkGitStatus: async () => ({
            isRepo: false,
            dirty: false,
            untracked: [],
            modified: [],
          }),
          assertCleanGit: () => undefined,
          acquireLock: async () => ({
            owner: { pid: process.pid, startTime: new Date().toISOString() },
            release: async () => undefined,
          }),
          createTransaction: () => transaction,
          runInstall: async () => {
            throw installFailure;
          },
        },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.cause).toBe(installFailure);
    expect(aggregate.errors).toContain(installFailure);
    expect(aggregate.errors).toContain(rollbackFailure);
    expect(aggregate.message).toContain("package.json");
  });

  test("an interrupted install removes its private candidate and releases its lock", async () => {
    const resolved = fixture();
    const parent = mkdtempSync(join(tmpdir(), "ghostinit-installer-interrupt-"));
    roots.push(parent);
    const projectRoot = join(parent, "project");
    let candidateRoot = "";
    let released = false;
    const transaction = {
      write: async () => undefined,
      commit: async () => ({ written: ["package.json"] }),
      rollback: async () => ({ success: true, restored: [], removed: [], failures: [] }),
    } as unknown as FsTransaction;

    await expect(
      runProjectInstall(
        {
          projectName: resolved.config.name,
          projectRoot,
          desiredConfig: resolved.desiredConfig,
          resolvedConfig: resolved.resolvedConfig,
          options: options(parent),
          noInstall: false,
          requireAbsentTarget: true,
        },
        {
          checkGitStatus: async () => ({
            isRepo: false,
            dirty: false,
            untracked: [],
            modified: [],
          }),
          assertCleanGit: () => undefined,
          acquireLock: async () => ({
            owner: { pid: process.pid, startTime: new Date().toISOString() },
            release: async () => {
              released = true;
            },
          }),
          createTransaction: (root) => {
            candidateRoot = root;
            return transaction;
          },
          runInstall: async () => {
            throw new InstallerInterruptedError("SIGTERM");
          },
        },
      ),
    ).rejects.toBeInstanceOf(InstallerInterruptedError);

    expect(candidateRoot).not.toBe("");
    expect(existsSync(candidateRoot)).toBe(false);
    expect(existsSync(projectRoot)).toBe(false);
    expect(released).toBe(true);
  });
});
