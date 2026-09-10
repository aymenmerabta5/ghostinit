// @allow-long 1420: retained guards, environment isolation, and verified process-tree cleanup form one shared protocol
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { delimiter, dirname, extname, join, resolve } from "node:path";
import {
  listPosixProcessGroupMembers,
  sendPosixProcessGroupSignal,
} from "./posix-process-groups.js";

const INSTALL_ENV_KEYS = new Set(
  [
    "PATH",
    "PATHEXT",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SystemDrive",
    "USER",
    "USERNAME",
    "NODE_ENV",
    "TMP",
    "TEMP",
    "TMPDIR",
    "TMP_DIR",
    "TEMP_DIR",
    "ComSpec",
    "SHELL",
    "PWD",
    "LANG",
    "LC_ALL",
    "BUN_INSTALL",
    "BUN_INSTALL_CACHE_DIR",
  ].map((key) => key.toUpperCase()),
);

/** @internal Exported for environment-boundary regression tests. */
export function buildInstallEnv(
  cwd?: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    // Windows exposes `Path` rather than `PATH` on many installations. Preserve
    // the original spelling because environment lookup is case-sensitive again
    // once the sanitized map is passed to a non-Windows child.
    if (INSTALL_ENV_KEYS.has(key.toUpperCase()) && value !== undefined) env[key] = value;
  }
  env.NODE_ENV = env.NODE_ENV ?? "development";
  if (cwd !== undefined) env.PWD = cwd;
  return env;
}

export const INSTALL_TIMEOUT_MS = 15 * 60_000;

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key]) => key.toUpperCase() === name.toUpperCase());
  return match?.[1];
}

function verifiedBunVersion(executable: string): string | undefined {
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    env: buildInstallEnv(),
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.status !== 0 || result.signal !== null || result.error) return undefined;
  return result.stdout.trim();
}

function windowsShimTarget(path: string): string | undefined {
  if (extname(path).toLowerCase() !== ".cmd") return undefined;
  try {
    const source = readFileSync(path, "utf8");
    // npm's generated Bun shim invokes this executable relative to `%dp0%`.
    // Return the executable itself so later spawns never depend on cmd.exe.
    if (!/%(?:~)?dp0%[\\/]node_modules[\\/]bun[\\/]bin[\\/]bun\.exe/i.test(source)) {
      return undefined;
    }
    return join(dirname(path), "node_modules", "bun", "bin", "bun.exe");
  } catch {
    return undefined;
  }
}

export interface BunDiscoveryDependencies {
  readonly exists: (path: string) => boolean;
  readonly version: (path: string) => string | undefined;
  readonly canonicalize: (path: string) => string;
  readonly windowsShimTarget: (path: string) => string | undefined;
}

const defaultBunDiscoveryDependencies: BunDiscoveryDependencies = {
  exists: existsSync,
  version: verifiedBunVersion,
  canonicalize: (path) => {
    try {
      return realpathSync.native(path);
    } catch {
      return path;
    }
  },
  windowsShimTarget,
};

/** @internal Finds, version-checks, and canonicalizes Bun for a Node-hosted CLI. */
export function discoverCanonicalBunExecutable(
  expectedBunVersion: string,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<BunDiscoveryDependencies> = {},
): string | undefined {
  const dependencies = { ...defaultBunDiscoveryDependencies, ...overrides };
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string | undefined): void => {
    if (!candidate || !dependencies.exists(candidate)) return;
    const normalized = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(candidate);
  };

  const bunInstall = environmentValue(env, "BUN_INSTALL");
  if (bunInstall) add(join(bunInstall, "bin", process.platform === "win32" ? "bun.exe" : "bun"));

  const home = environmentValue(env, process.platform === "win32" ? "USERPROFILE" : "HOME");
  if (home) add(join(home, ".bun", "bin", process.platform === "win32" ? "bun.exe" : "bun"));

  const pathValue = environmentValue(env, "PATH") ?? "";
  const pathExtensions =
    process.platform === "win32"
      ? (environmentValue(env, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .map((extension) => extension.trim().toLowerCase())
          .filter(Boolean)
      : [""];
  for (const rawDirectory of pathValue.split(delimiter)) {
    const directory = rawDirectory.trim().replace(/^"|"$/g, "");
    if (!directory) continue;
    for (const extension of pathExtensions) {
      const path = resolve(directory, `bun${extension}`);
      const shimTarget = dependencies.windowsShimTarget(path);
      if (shimTarget) add(shimTarget);
      // Node cannot execute .cmd/.bat without a shell. Only retain native
      // executables (or POSIX shebang executables) as stable final commands.
      if (process.platform !== "win32" || extension === ".exe" || extension === ".com") {
        add(path);
      }
    }
  }

  for (const candidate of candidates) {
    if (dependencies.version(candidate) !== expectedBunVersion) continue;
    return dependencies.canonicalize(candidate);
  }
  return undefined;
}

let cachedNodeHostedBunExecutable:
  | { readonly version: string; readonly executable: string }
  | undefined;

/**
 * Package management is supported only by the Bun runtime pinned in the
 * version registry. Never execute a bare `bun`/`bunx` through PATH: Node-hosted
 * entrypoints resolve absolute candidates and reject every non-matching version.
 */
export function resolveCanonicalBunExecutable(expectedBunVersion: string): string {
  const bunRuntime = (
    globalThis as typeof globalThis & { readonly Bun?: { readonly version: string } }
  ).Bun;
  if (bunRuntime !== undefined && bunRuntime.version !== expectedBunVersion) {
    throw new Error(
      `Dependency installation requires Bun ${expectedBunVersion}; current runtime is Bun ${bunRuntime.version}.`,
    );
  }
  if (bunRuntime !== undefined) {
    if (!process.execPath) {
      throw new Error(`Bun ${expectedBunVersion} did not expose its executable path.`);
    }
    return process.execPath;
  }
  if (
    cachedNodeHostedBunExecutable?.version === expectedBunVersion &&
    existsSync(cachedNodeHostedBunExecutable.executable)
  ) {
    return cachedNodeHostedBunExecutable.executable;
  }
  const discovered = discoverCanonicalBunExecutable(expectedBunVersion);
  if (discovered) {
    cachedNodeHostedBunExecutable = { version: expectedBunVersion, executable: discovered };
    return discovered;
  }
  throw new Error(
    `Dependency installation requires Bun ${expectedBunVersion}, but no matching executable was found in BUN_INSTALL, the user Bun directory, or PATH.`,
  );
}

export class InstallerProcessTreeError extends Error {
  readonly cleanupVerified = false;

  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "InstallerProcessTreeError";
  }
}

export class InstallerContainmentUnavailableError extends InstallerProcessTreeError {
  readonly fundamentallyUnsandboxable = true;

  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "InstallerContainmentUnavailableError";
  }
}

export class InstallerInterruptedError extends Error {
  readonly signal: "SIGINT" | "SIGTERM";

  constructor(signal: "SIGINT" | "SIGTERM") {
    super(`Installer interrupted by ${signal}`);
    this.name = "InstallerInterruptedError";
    this.signal = signal;
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolveWait) => setTimeout(resolveWait, ms));

function processGroupExists(pid: number): boolean {
  try {
    return listPosixProcessGroupMembers(pid).length > 0;
  } catch (error) {
    throw new InstallerProcessTreeError(
      `Could not verify POSIX process group ${pid}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

function signalInstallerProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    sendPosixProcessGroupSignal(pid, signal);
  } catch (error) {
    throw new InstallerProcessTreeError(
      `Could not send ${signal} to POSIX process group ${pid}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise<boolean>((resolveExit) => {
    const finish = (exited: boolean): void => {
      clearTimeout(timer);
      child.off("exit", exitedListener);
      child.off("close", exitedListener);
      resolveExit(exited);
    };
    const exitedListener = (): void => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", exitedListener);
    child.once("close", exitedListener);
  });
}

const INSTALLER_SCOPE_ENV_KEY = "GHOSTINIT_INSTALLER_SCOPE_ID";

function linuxInstallerScopePids(scopeId: string): number[] {
  const marker = Buffer.from(`${INSTALLER_SCOPE_ENV_KEY}=${scopeId}\0`, "utf8");
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = readdirSync("/proc", { withFileTypes: true });
  } catch (error) {
    throw new InstallerProcessTreeError(
      `Could not enumerate Linux installer scope ${scopeId}`,
      error,
    );
  }
  const pids: number[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      if (readFileSync(`/proc/${entry.name}/environ`).includes(marker)) {
        pids.push(Number.parseInt(entry.name, 10));
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "EACCES" && code !== "EPERM") {
        throw new InstallerProcessTreeError(
          `Could not inspect Linux process ${entry.name} for installer scope ${scopeId}`,
          error,
        );
      }
    }
  }
  return pids;
}

function psInstallerScopePids(scopeId: string): number[] {
  const executable = existsSync("/bin/ps") ? "/bin/ps" : "/usr/bin/ps";
  const result = spawnSync(executable, ["axeww", "-o", "pid=", "-o", "command="], {
    encoding: "utf8",
    env: buildInstallEnv(),
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || result.signal !== null || result.error) {
    throw new InstallerProcessTreeError(
      `Could not enumerate POSIX installer scope ${scopeId}`,
      result.error,
    );
  }
  const marker = `${INSTALLER_SCOPE_ENV_KEY}=${scopeId}`;
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.split(/\s+/).includes(marker))
    .map((line) => Number.parseInt(/^\s*(\d+)/.exec(line)?.[1] ?? "", 10))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

function createPosixScopeTracker(scopeId: string, guardPid: number): () => number[] {
  const candidates: Array<() => number[]> = [];
  if (process.platform === "linux" && existsSync("/proc")) {
    candidates.push(() => linuxInstallerScopePids(scopeId));
  }
  candidates.push(() => psInstallerScopePids(scopeId));
  for (const candidate of candidates) {
    try {
      if (candidate().includes(guardPid)) return candidate;
    } catch {
      // Try the portable process-table fallback before failing closed.
    }
  }
  throw new InstallerProcessTreeError(
    `POSIX installer scope ${scopeId} could not observe its live guard PID ${guardPid}`,
  );
}

function signalPosixScope(pids: readonly number[], signal: NodeJS.Signals): void {
  for (const scopedPid of new Set(pids)) {
    if (scopedPid === process.pid) continue;
    try {
      process.kill(scopedPid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw new InstallerProcessTreeError(
          `Could not send ${signal} to scoped installer process ${scopedPid}`,
          error,
        );
      }
    }
  }
}

async function waitForPosixScopeExit(
  groupPid: number,
  tracker: () => number[],
  timeoutMs: number,
  signal: NodeJS.Signals,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const scoped = tracker();
    if (scoped.length > 0) signalPosixScope(scoped, signal);
    if (!processGroupExists(groupPid) && scoped.length === 0) return true;
    await wait(50);
  }
  const scoped = tracker();
  if (scoped.length > 0) signalPosixScope(scoped, signal);
  await wait(50);
  return !processGroupExists(groupPid) && tracker().length === 0;
}

async function terminatePosixProcessGroup(
  child: ChildProcess,
  pid: number,
  scopeId: string,
): Promise<void> {
  const tracker = createPosixScopeTracker(scopeId, pid);
  if (processGroupExists(pid)) signalInstallerProcessGroup(pid, "SIGTERM");
  signalPosixScope(tracker(), "SIGTERM");
  const [gracefulChildExited, scopeExited] = await Promise.all([
    waitForChildExit(child, 2_000),
    waitForPosixScopeExit(pid, tracker, 2_000, "SIGTERM"),
  ]);
  if (gracefulChildExited && scopeExited) return;

  if (processGroupExists(pid)) signalInstallerProcessGroup(pid, "SIGKILL");
  signalPosixScope(tracker(), "SIGKILL");
  const [forcedChildExited, groupExited] = await Promise.all([
    waitForChildExit(child, 5_000),
    waitForPosixScopeExit(pid, tracker, 5_000, "SIGKILL"),
  ]);
  if (!forcedChildExited || !groupExited) {
    throw new InstallerProcessTreeError(
      `POSIX installer scope for guard PID ${pid} remained live after SIGKILL; candidate cleanup was not attempted`,
    );
  }
}

interface WindowsInstallerJob {
  terminate(): Promise<void>;
}

function windowsPowerShellExecutable(): string {
  return join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function windowsJobControllerSource(pid: number): string {
  return String.raw`
const rootPid = ${pid};
if (process.platform !== "win32") throw new Error("Installer Job Object controller requires Windows");
if (process.arch === "ia32") throw new Error("Installer Job Object controller requires 64-bit Windows");

const READY = "ghostinit:job-ready";
const STOPPED = "ghostinit:job-stopped";
const TERMINATE = "ghostinit:job-terminate";
const { dlopen, ptr } = await import("bun:ffi");
const kernel = dlopen("kernel32.dll", {
  CreateJobObjectW: { args: ["ptr", "ptr"], returns: "u64" },
  SetInformationJobObject: { args: ["u64", "u32", "ptr", "u32"], returns: "i32" },
  OpenProcess: { args: ["u32", "i32", "u32"], returns: "u64" },
  AssignProcessToJobObject: { args: ["u64", "u64"], returns: "i32" },
  TerminateJobObject: { args: ["u64", "u32"], returns: "i32" },
  QueryInformationJobObject: {
    args: ["u64", "u32", "ptr", "u32", "ptr"],
    returns: "i32",
  },
  CloseHandle: { args: ["u64"], returns: "i32" },
  GetLastError: { args: [], returns: "u32" },
});
let jobHandle = null;
let processHandle = null;
let closed = false;
let terminating = false;

function lastError(operation) {
  return new Error(operation + " failed with Windows error " + kernel.symbols.GetLastError());
}

function closeNativeHandles() {
  if (closed) return;
  closed = true;
  if (processHandle) kernel.symbols.CloseHandle(processHandle);
  if (jobHandle) kernel.symbols.CloseHandle(jobHandle);
  kernel.close();
}

function report(message) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== "function" || !process.connected) {
      reject(new Error("Installer Job Object controller lost its private IPC channel"));
      return;
    }
    process.send(message, (error) => (error ? reject(error) : resolve()));
  });
}

function activeProcesses() {
  const accounting = new Uint8Array(48);
  if (
    kernel.symbols.QueryInformationJobObject(
      jobHandle,
      1,
      ptr(accounting),
      accounting.byteLength,
      null,
    ) === 0
  ) {
    throw lastError("QueryInformationJobObject");
  }
  return new DataView(accounting.buffer).getUint32(40, true);
}

async function fail(error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  closeNativeHandles();
  process.exit(1);
}

async function terminate() {
  if (terminating) return;
  terminating = true;
  try {
    if (kernel.symbols.TerminateJobObject(jobHandle, 1) === 0) {
      throw lastError("TerminateJobObject");
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && activeProcesses() !== 0) {
      await Bun.sleep(10);
    }
    if (activeProcesses() !== 0) {
      throw new Error("Installer Job Object still has live processes after termination");
    }
    await report({ type: STOPPED });
    closeNativeHandles();
    process.exit(0);
  } catch (error) {
    await fail(error);
  }
}

try {
  jobHandle = kernel.symbols.CreateJobObjectW(null, null);
  if (!jobHandle) throw lastError("CreateJobObjectW");
  const limits = new Uint8Array(144);
  // JOBOBJECT_EXTENDED_LIMIT_INFORMATION.BasicLimitInformation.LimitFlags
  // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, with breakaway intentionally absent.
  new DataView(limits.buffer).setUint32(16, 0x00002000, true);
  if (kernel.symbols.SetInformationJobObject(jobHandle, 9, ptr(limits), limits.byteLength) === 0) {
    throw lastError("SetInformationJobObject");
  }
  processHandle = kernel.symbols.OpenProcess(0x00000101, 0, rootPid);
  if (!processHandle) throw lastError("OpenProcess");
  if (kernel.symbols.AssignProcessToJobObject(jobHandle, processHandle) === 0) {
    throw lastError("AssignProcessToJobObject");
  }
  kernel.symbols.CloseHandle(processHandle);
  processHandle = null;

  process.on("message", (message) => {
    if (message && message.type === TERMINATE) void terminate();
    else void fail(new Error("Installer Job Object controller received invalid IPC data"));
  });
  process.once("disconnect", () => {
    closeNativeHandles();
    process.exit(1);
  });
  await report({ type: READY });
  setInterval(() => {}, 1000);
} catch (error) {
  await fail(error);
}`;
}

interface WindowsJobControllerMessage {
  readonly type: "ghostinit:job-ready" | "ghostinit:job-stopped";
}

export type WindowsJobControllerState = "starting" | "ready" | "terminating" | "stopped";

function isWindowsJobControllerMessage(value: unknown): value is WindowsJobControllerMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const type = (value as { readonly type?: unknown }).type;
  return type === "ghostinit:job-ready" || type === "ghostinit:job-stopped";
}

/** @internal Rejects malformed, duplicate, and out-of-order controller frames. */
export function advanceWindowsJobControllerState(
  state: WindowsJobControllerState,
  message: unknown,
): WindowsJobControllerState {
  if (!isWindowsJobControllerMessage(message)) {
    throw new Error("Windows installer Job Object controller returned invalid IPC data");
  }
  if (state === "starting" && message.type === "ghostinit:job-ready") return "ready";
  if (state === "terminating" && message.type === "ghostinit:job-stopped") return "stopped";
  throw new Error(
    `Windows installer Job Object controller returned ${message.type} while ${state}`,
  );
}

async function createWindowsInstallerJob(
  pid: number,
  expectedBunVersion: string,
): Promise<WindowsInstallerJob> {
  const controller = spawn(
    resolveCanonicalBunExecutable(expectedBunVersion),
    ["-e", windowsJobControllerSource(pid)],
    {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
      env: buildInstallEnv(),
    },
  );
  let stderr = "";
  let state: WindowsJobControllerState | "failed" = "starting";
  let protocolError: InstallerProcessTreeError | undefined;
  let finishReady: ((error?: Error) => void) | undefined;
  const controllerState = (): WindowsJobControllerState | "failed" => state;
  controller.on("message", (message) => {
    if (state === "failed") return;
    try {
      state = advanceWindowsJobControllerState(state, message);
      if (state === "ready") finishReady?.();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      protocolError =
        state === "starting"
          ? new InstallerContainmentUnavailableError(
              `Windows installer lifecycle is fundamentally unsandboxable because ${detail}`,
              error,
            )
          : new InstallerProcessTreeError(detail, error);
      state = "failed";
      try {
        controller.kill("SIGKILL");
      } catch {}
      finishReady?.(protocolError);
    }
  });
  controller.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-8_000);
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolveClose) => {
      controller.once("close", (code, signal) => resolveClose({ code, signal }));
    },
  );
  const waitForControllerClose = (
    timeoutMs: number,
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null } | undefined> =>
    new Promise((resolveOutcome) => {
      const timeout = setTimeout(() => resolveOutcome(undefined), timeoutMs);
      void closed.then((value) => {
        clearTimeout(timeout);
        resolveOutcome(value);
      });
    });

  await new Promise<void>((resolveReady, rejectReady) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      finishReady = undefined;
      if (timeout !== undefined) clearTimeout(timeout);
      if (error) {
        try {
          controller.kill("SIGKILL");
        } catch {}
        rejectReady(error);
      } else resolveReady();
    };
    finishReady = finish;
    controller.once("error", (error) =>
      finish(
        new InstallerContainmentUnavailableError(
          `Windows installer lifecycle is fundamentally unsandboxable because its Job Object controller could not start: ${error.message}`,
          error,
        ),
      ),
    );
    void closed.then(({ code, signal }) => {
      if (state === "starting") {
        finish(
          new InstallerContainmentUnavailableError(
            `Windows installer lifecycle is fundamentally unsandboxable because the guard could not be assigned to a Job Object (controller code ${String(code)}${signal ? `, signal ${signal}` : ""}${stderr.trim() ? `: ${stderr.trim()}` : ""})`,
          ),
        );
      }
    });
    timeout = setTimeout(
      () =>
        finish(
          new InstallerContainmentUnavailableError(
            "Windows installer lifecycle is fundamentally unsandboxable because Job Object assignment timed out",
          ),
        ),
      30_000,
    );
  });

  let termination: Promise<void> | undefined;
  const terminateController = async (): Promise<void> => {
    if (state !== "ready") {
      const outcome = await waitForControllerClose(5_000);
      throw (
        protocolError ??
        new InstallerProcessTreeError(
          `Windows installer Job Object controller for guard PID ${pid} was ${state}${outcome ? ` (code ${String(outcome.code)}${outcome.signal ? `, signal ${outcome.signal}` : ""})` : " and did not exit"}`,
        )
      );
    }
    state = "terminating";
    let sendError: unknown;
    if (controller.exitCode === null && controller.signalCode === null) {
      try {
        await new Promise<void>((resolveSend, rejectSend) => {
          if (!controller.connected) {
            rejectSend(new Error("private IPC channel was disconnected"));
            return;
          }
          controller.send({ type: "ghostinit:job-terminate" }, (error) => {
            if (error) rejectSend(error);
            else resolveSend();
          });
        });
      } catch (error) {
        sendError = error;
        try {
          controller.kill("SIGKILL");
        } catch {}
      }
    } else sendError = new Error("controller exited before termination");

    const outcome = await waitForControllerClose(60_000);
    if (!outcome) {
      try {
        controller.kill("SIGKILL");
      } catch {}
      await waitForControllerClose(5_000);
      throw new InstallerProcessTreeError(
        `Windows installer Job Object controller for guard PID ${pid} timed out`,
      );
    }
    if (sendError) {
      throw new InstallerProcessTreeError(
        `Windows installer Job Object controller for guard PID ${pid} could not receive termination: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
        sendError,
      );
    }
    if (protocolError) throw protocolError;
    if (outcome.code !== 0 || outcome.signal !== null || controllerState() !== "stopped") {
      throw new InstallerProcessTreeError(
        `Windows installer Job Object controller for guard PID ${pid} failed with code ${String(outcome.code)}${outcome.signal ? ` (${outcome.signal})` : ""}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
      );
    }
  };

  return {
    async terminate(): Promise<void> {
      termination ??= terminateController();
      await termination;
    },
  };
}

function windowsTreeCleanupScript(pid: number): string {
  return `$ErrorActionPreference = "Stop"
$rootPid = ${pid}
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)
$root = @($all | Where-Object { [int]$_.ProcessId -eq $rootPid })
if ($root.Count -ne 1) { throw "Installer guard PID $rootPid was not live before cleanup" }
$tracked = @{}
$tracked[[string]$rootPid] = ([datetime]$root[0].CreationDate).ToUniversalTime().Ticks
$changed = $true
while ($changed) {
  $changed = $false
  foreach ($entry in $all) {
    $processId = [int]$entry.ProcessId
    $parentId = [int]$entry.ParentProcessId
    $parentCreatedAt = $tracked[[string]$parentId]
    $processCreatedAt = ([datetime]$entry.CreationDate).ToUniversalTime().Ticks
    if (
      $null -ne $parentCreatedAt -and
      $processCreatedAt -ge $parentCreatedAt -and
      -not $tracked.ContainsKey([string]$processId)
    ) {
      $tracked[[string]$processId] = $processCreatedAt
      $changed = $true
    }
  }
}
$identities = @{}
foreach ($entry in $tracked.GetEnumerator()) {
  if ([int]$entry.Key -ne $rootPid) { $identities[$entry.Key] = $entry.Value }
}
& "$env:SystemRoot\\System32\\taskkill.exe" /PID $rootPid /T /F 2>$null | Out-Null
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $live = @($identities.GetEnumerator() | ForEach-Object {
    $processId = [int]$_.Key
    $expected = [long]$_.Value
    try {
      # Get-Process opens the current process object instead of consulting a
      # potentially stale CIM snapshot after taskkill.
      $process = Get-Process -Id $processId -ErrorAction Stop
      [void]$process.Handle
      $createdAt = $process.StartTime.ToUniversalTime().Ticks
      if ([math]::Abs($createdAt - $expected) -le 10000) {
        [pscustomobject]@{
          Process = $process
          ProcessId = $processId
          CreationTicks = $createdAt
        }
      } else {
        $process.Dispose()
      }
    } catch {
      # The captured process identity is gone.
    }
  })
  if ($live.Count -eq 0) { exit 0 }
  # Never issue another PID-based kill after the live guard was terminated.
  # Kill through the already-open process handle, which
  # keeps that captured process object stable even if it exits concurrently.
  foreach ($entry in $live) {
    try { $entry.Process.Kill() } catch { } finally { $entry.Process.Dispose() }
  }
  Start-Sleep -Milliseconds 50
}
$details = @($live | ForEach-Object {
  "$([int]$_.ProcessId)@$([long]$_.CreationTicks)"
}) -join "; "
throw "Captured installer processes remained live: $details"`;
}

async function runWindowsTreeCleanup(child: ChildProcess, pid: number): Promise<void> {
  // The command runs below a guard that deliberately remains alive after the
  // command reports its result. Refusing to target an exited guard means this
  // code never follows a bare PID after Windows may have reassigned it.
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new InstallerProcessTreeError(
      `Windows installer guard PID ${pid} exited before tree cleanup; refusing to target a potentially reused PID`,
    );
  }
  const powershell = windowsPowerShellExecutable();
  await new Promise<void>((resolveCleanup, rejectCleanup) => {
    const cleanup = spawn(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsTreeCleanupScript(pid)],
      {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
        env: buildInstallEnv(),
      },
    );
    let stderr = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectCleanup(error);
      else resolveCleanup();
    };
    cleanup.stderr?.on("data", (chunk) => {
      if (stderr.length < 4_000) stderr += String(chunk).slice(0, 4_000 - stderr.length);
    });
    cleanup.once("error", (error) =>
      finish(
        new InstallerProcessTreeError(
          `Could not start Windows process-tree cleanup for PID ${pid}: ${error.message}`,
          error,
        ),
      ),
    );
    cleanup.once("close", (code, signal) => {
      if (code === 0 && signal === null) finish();
      else
        finish(
          new InstallerProcessTreeError(
            `Windows process-tree cleanup for PID ${pid} failed with code ${String(code)}${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
          ),
        );
    });
    const timer = setTimeout(() => {
      try {
        cleanup.kill("SIGKILL");
      } catch {}
      finish(
        new InstallerProcessTreeError(
          `Windows process-tree cleanup for PID ${pid} timed out; candidate cleanup was not attempted`,
        ),
      );
    }, 60_000);
  });
  if (!(await waitForChildExit(child, 5_000))) {
    throw new InstallerProcessTreeError(
      `Windows installer guard PID ${pid} remained live after taskkill`,
    );
  }
}

async function terminateInstallerProcessTree(
  child: ChildProcess,
  scopeId: string | undefined,
  windowsJob?: WindowsInstallerJob,
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32" && windowsJob) {
    await windowsJob.terminate();
    if (!(await waitForChildExit(child, 5_000))) {
      throw new InstallerProcessTreeError(
        `Windows installer guard PID ${pid} remained live after Job Object termination`,
      );
    }
  } else if (process.platform === "win32") await runWindowsTreeCleanup(child, pid);
  else if (scopeId !== undefined) await terminatePosixProcessGroup(child, pid, scopeId);
  else throw new InstallerProcessTreeError("POSIX installer cleanup is missing its scope id");
}

type InstallerParentSignal = "SIGINT" | "SIGTERM";

export interface InstallerSignalSource {
  on(event: InstallerParentSignal, listener: () => void): unknown;
  off(event: InstallerParentSignal, listener: () => void): unknown;
}

export interface InstallerCommandInput {
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly label: string;
  readonly timeoutMs: number;
  readonly inheritStdout?: boolean;
  /** @internal Allows isolated signal regression tests without signaling the test runner. */
  readonly signalSource?: InstallerSignalSource;
  /** Require a kernel-backed boundary instead of the portable POSIX fallback. */
  readonly requireKernelContainment?: boolean;
  /** @internal Makes fallback selection deterministic in platform regression tests. */
  readonly linuxNamespaceResolver?: LinuxNamespaceResolver;
  /** Routes the portable-containment diagnostic through the caller's logger. */
  readonly onContainmentFallback?: (message: string) => void;
}

export interface SupervisedCommandInput extends InstallerCommandInput {
  /** Caller-filtered environment; installer callers retain buildInstallEnv defaults. */
  readonly env?: NodeJS.ProcessEnv;
  /** Observers receive private output; callers decide whether it is safe to display. */
  readonly onStdout?: (chunk: Buffer) => void;
  readonly onStderr?: (chunk: Buffer) => void;
  /** Cancellation completes only after the same retained guard verifies cleanup. */
  readonly abortSignal?: AbortSignal;
}

export interface SupervisedCommandResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly cleanupVerified: boolean;
  readonly error?: Error;
}

type InstallerGuardMessage =
  | { readonly type: "ghostinit:ready" }
  | { readonly type: "ghostinit:spawn-error"; readonly message: string }
  | {
      readonly type: "ghostinit:complete";
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    };

// The guard is the stable process-tree root. It reports the real command's
// result over IPC but stays alive until the parent has killed and verified the
// complete tree. This is what makes Windows cleanup safe for short-lived
// commands that daemonize a descendant: cleanup never chases an exited PID.
const INSTALLER_GUARD_SOURCE = String.raw`
const { spawn } = require("node:child_process");
const payload = JSON.parse(Buffer.from(process.argv[1], "base64url").toString("utf8"));
let command;
let completed = false;
if (typeof process.send !== "function" || !process.connected) {
  throw new Error("Installer guard requires a private IPC channel");
}
process.once("disconnect", () => process.exit(1));
const report = (message) => {
  if (!process.connected) process.exit(1);
  process.send(message, (error) => {
    if (error) process.exit(1);
  });
};
const complete = (message) => {
  if (completed) return;
  completed = true;
  report(message);
};
process.on("message", (message) => {
  if (!message || message.type !== "ghostinit:start" || command) return;
  try {
    command = spawn(payload.command, payload.argv, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });
    command.once("error", (error) =>
      complete({ type: "ghostinit:spawn-error", message: error.message }),
    );
    command.once("close", (code, signal) =>
      complete({ type: "ghostinit:complete", code, signal }),
    );
  } catch (error) {
    complete({
      type: "ghostinit:spawn-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
report({ type: "ghostinit:ready" });
setInterval(() => {}, 1000);
`;

interface InstallerGuardLaunch {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly containment: "windows-job" | "linux-pid-namespace" | "posix-scope";
  readonly containmentWarning?: string;
}

let cachedLinuxNamespaceExecutable: string | null | undefined;

function linuxNamespaceExecutable(): string | undefined {
  if (cachedLinuxNamespaceExecutable !== undefined) {
    return cachedLinuxNamespaceExecutable ?? undefined;
  }
  const executable = ["/usr/bin/unshare", "/bin/unshare"].find((path) => existsSync(path));
  if (!executable) {
    cachedLinuxNamespaceExecutable = null;
    return undefined;
  }
  const runtimeSentinel = "ghostinit-pid-namespace-ready";
  const preflight = spawnSync(
    executable,
    [
      "--user",
      "--map-root-user",
      "--pid",
      "--fork",
      "--kill-child=SIGKILL",
      "--mount-proc",
      process.execPath,
      "-e",
      `process.stdout.write(${JSON.stringify(runtimeSentinel)})`,
    ],
    {
      encoding: "utf8",
      env: buildInstallEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
      windowsHide: true,
    },
  );
  if (
    preflight.status !== 0 ||
    preflight.signal !== null ||
    preflight.error ||
    preflight.stdout !== runtimeSentinel
  ) {
    cachedLinuxNamespaceExecutable = null;
    return undefined;
  }
  cachedLinuxNamespaceExecutable = executable;
  return executable;
}

type LinuxNamespaceResolver = () => string | undefined;

function installerGuardLaunch(
  payload: string,
  requireKernelContainment: boolean,
  resolveLinuxNamespace: LinuxNamespaceResolver,
): InstallerGuardLaunch {
  const guardArgv = ["-e", INSTALLER_GUARD_SOURCE, payload];
  if (process.platform === "win32") {
    return { executable: process.execPath, argv: guardArgv, containment: "windows-job" };
  }
  const namespaceExecutable = process.platform === "linux" ? resolveLinuxNamespace() : undefined;
  if (namespaceExecutable) {
    // The environment scope remains useful for diagnostics, but is not the
    // containment boundary. A private PID namespace prevents a descendant from
    // escaping by creating a new session and deleting inherited environment.
    return {
      executable: namespaceExecutable,
      argv: [
        "--user",
        "--map-root-user",
        "--pid",
        "--fork",
        "--kill-child=SIGKILL",
        "--mount-proc",
        process.execPath,
        ...guardArgv,
      ],
      containment: "linux-pid-namespace",
    };
  }
  if (requireKernelContainment) {
    throw new InstallerContainmentUnavailableError(
      process.platform === "linux"
        ? "Strict installer containment requires a private Linux PID namespace, but unshare is unavailable or denied"
        : `Strict installer containment requires a kernel process container that is unavailable on ${process.platform}`,
    );
  }
  // This portable path contains normal daemonization through both the process
  // group and an inherited environment scope. It is not a sandbox against a
  // malicious package that deliberately calls setsid(2) and scrubs that marker;
  // Bun's default lifecycle-script trust policy limits that supply-chain case.
  return {
    executable: process.execPath,
    argv: guardArgv,
    containment: "posix-scope",
    containmentWarning:
      `Kernel PID-namespace containment is unavailable on ${process.platform}; continuing with process-group and scoped descendant cleanup. ` +
      "A malicious lifecycle process that both starts a new session and removes its scope marker can escape cleanup. Bun blocks untrusted dependency lifecycle scripts by default.",
  };
}

function isInstallerGuardMessage(value: unknown): value is InstallerGuardMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  const type = (value as { type?: unknown }).type;
  if (type === "ghostinit:ready") return true;
  if (type === "ghostinit:spawn-error") {
    return typeof (value as { message?: unknown }).message === "string";
  }
  if (type !== "ghostinit:complete") return false;
  const { code, signal } = value as { code?: unknown; signal?: unknown };
  return (
    (code === null || typeof code === "number") && (signal === null || typeof signal === "string")
  );
}

const INSTALLER_GUARD_READY_TIMEOUT_MS = 15_000;
let emittedDefaultContainmentWarning = false;

function reportDefaultContainmentFallback(message: string): void {
  if (emittedDefaultContainmentWarning) return;
  emittedDefaultContainmentWarning = true;
  process.emitWarning(message, { code: "GHOSTINIT_INSTALLER_CONTAINMENT_FALLBACK" });
}

/** @internal Exported so the real timeout/tree-cleanup protocol can be regression-tested. */
export function runSupervisedCommand(
  args: SupervisedCommandInput,
  expectedBunVersion: string,
): Promise<SupervisedCommandResult> {
  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let timedOut = false;
  const outcome = (error?: Error, cleanupVerified = true): SupervisedCommandResult => ({
    exitCode,
    signal,
    timedOut,
    cleanupVerified,
    ...(error ? { error } : {}),
  });
  if (args.abortSignal?.aborted) {
    signal = args.abortSignal.reason === "SIGINT" ? "SIGINT" : "SIGTERM";
    return Promise.resolve(outcome(new InstallerInterruptedError(signal)));
  }
  let launch: InstallerGuardLaunch;
  const payload = Buffer.from(
    JSON.stringify({ command: args.command, argv: [...args.argv] }),
    "utf8",
  ).toString("base64url");
  try {
    launch = installerGuardLaunch(
      payload,
      args.requireKernelContainment ?? false,
      args.linuxNamespaceResolver ?? linuxNamespaceExecutable,
    );
    if (launch.containmentWarning) {
      (args.onContainmentFallback ?? reportDefaultContainmentFallback)(launch.containmentWarning);
    }
  } catch (error) {
    return Promise.resolve(outcome(error instanceof Error ? error : new Error(String(error))));
  }
  return new Promise((resolve) => {
    const scopeId = process.platform === "win32" ? undefined : randomUUID();
    const child = spawn(launch.executable, launch.argv, {
      cwd: args.cwd,
      stdio: ["ignore", args.inheritStdout ? "inherit" : "pipe", "pipe", "ipc"],
      env: {
        ...(args.env ?? buildInstallEnv(args.cwd)),
        ...(scopeId === undefined ? {} : { [INSTALLER_SCOPE_ENV_KEY]: scopeId }),
      },
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const streamsClosed = new Promise<void>((resolveClosed) =>
      child.once("close", () => resolveClosed()),
    );
    let stderr = "";
    let settled = false;
    let finalizing = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let readinessTimeout: ReturnType<typeof setTimeout> | undefined;
    let windowsJob: WindowsInstallerJob | undefined;
    let pendingWindowsJob: Promise<WindowsInstallerJob> | undefined;
    let commandStarted = false;
    const signalSource: InstallerSignalSource = args.signalSource ?? {
      on(event, listener) {
        process.on(event, listener);
      },
      off(event, listener) {
        // Bun's Process.off declaration currently narrows this inherited
        // EventEmitter method to memoryPressure even though signals work at
        // runtime. Call the base implementation without weakening the public
        // test seam or using an unsafe cast.
        EventEmitter.prototype.removeListener.call(process, event, listener);
      },
    };
    const onSigint = (): void => {
      signal = "SIGINT";
      void failAfterVerifiedCleanup(new InstallerInterruptedError("SIGINT"));
    };
    const onSigterm = (): void => {
      signal = "SIGTERM";
      void failAfterVerifiedCleanup(new InstallerInterruptedError("SIGTERM"));
    };
    const onAbort = (): void => {
      if (args.abortSignal?.reason === "SIGINT") onSigint();
      else onSigterm();
    };
    const settle = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (readinessTimeout !== undefined) clearTimeout(readinessTimeout);
      signalSource.off("SIGINT", onSigint);
      signalSource.off("SIGTERM", onSigterm);
      args.abortSignal?.removeEventListener("abort", onAbort);
      callback();
    };
    // Non-inherited stdout still has to be drained or a verbose package script
    // can fill the pipe and deadlock before the timeout protocol runs.
    const observe = (observer: ((chunk: Buffer) => void) | undefined, chunk: Buffer): void => {
      try {
        observer?.(chunk);
      } catch (error) {
        void failAfterVerifiedCleanup(error instanceof Error ? error : new Error(String(error)));
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => observe(args.onStdout, chunk));
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 32_000) stderr += String(chunk).slice(0, 32_000 - stderr.length);
      observe(args.onStderr, chunk);
    });

    const cleanup = async (): Promise<void> => {
      // Cancellation can arrive while pre-start Job assignment is in flight.
      // Keep that controller in this operation instead of orphaning its cleanup.
      if (pendingWindowsJob) {
        try {
          windowsJob = await pendingWindowsJob;
        } catch {
          // No command was admitted; the live waiting guard still needs cleanup.
        }
      }
      await terminateInstallerProcessTree(child, scopeId, windowsJob);
      // IPC completion and process exit do not imply that the independent
      // stdout/stderr pipes have drained. Preserve their final diagnostic bytes.
      await new Promise<void>((resolveClosed, rejectClosed) => {
        const timeout = setTimeout(
          () =>
            rejectClosed(
              new InstallerProcessTreeError(
                `${args.label} guard streams did not close after cleanup`,
              ),
            ),
          5_000,
        );
        void streamsClosed.then(() => {
          clearTimeout(timeout);
          resolveClosed();
        });
      });
    };

    const failAfterVerifiedCleanup = async (failure: Error): Promise<void> => {
      if (settled || finalizing) return;
      finalizing = true;
      if (timeout !== undefined) clearTimeout(timeout);
      try {
        await cleanup();
        settle(() => resolve(outcome(failure, !(failure instanceof InstallerProcessTreeError))));
      } catch (cleanupError) {
        settle(() =>
          resolve(
            outcome(
              cleanupError instanceof InstallerProcessTreeError
                ? cleanupError
                : new InstallerProcessTreeError(
                    `${args.label} failed and its process tree could not be verified as stopped`,
                    cleanupError,
                  ),
              false,
            ),
          ),
        );
      }
    };

    const succeedAfterVerifiedCleanup = async (): Promise<void> => {
      if (settled || finalizing) return;
      finalizing = true;
      if (timeout !== undefined) clearTimeout(timeout);
      try {
        // A lifecycle command that exits zero can still daemonize a writer.
        // Verify the same tree boundary before the next phase can begin.
        await cleanup();
        settle(() => resolve(outcome()));
      } catch (cleanupError) {
        settle(() =>
          resolve(
            outcome(
              cleanupError instanceof InstallerProcessTreeError
                ? cleanupError
                : new InstallerProcessTreeError(
                    `${args.label} exited successfully but left an unverifiable process tree`,
                    cleanupError,
                  ),
              false,
            ),
          ),
        );
      }
    };

    signalSource.on("SIGINT", onSigint);
    signalSource.on("SIGTERM", onSigterm);
    args.abortSignal?.addEventListener("abort", onAbort, { once: true });
    readinessTimeout = setTimeout(() => {
      void failAfterVerifiedCleanup(
        new Error(
          `${args.label} ${launch.containment} guard did not become ready within ${Math.ceil(INSTALLER_GUARD_READY_TIMEOUT_MS / 1000)}s`,
        ),
      );
    }, INSTALLER_GUARD_READY_TIMEOUT_MS);
    const startCommand = (): void => {
      if (commandStarted || settled || finalizing) return;
      commandStarted = true;
      timeout = setTimeout(() => {
        timedOut = true;
        void failAfterVerifiedCleanup(
          new Error(
            `${args.label} timed out after ${Math.ceil(args.timeoutMs / 1000)}s${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
          ),
        );
      }, args.timeoutMs);
      child.send({ type: "ghostinit:start" }, (error) => {
        if (error) {
          void failAfterVerifiedCleanup(
            new Error(`${args.label} guard could not start the command: ${error.message}`),
          );
        }
      });
    };
    child.once("error", (error) => {
      void failAfterVerifiedCleanup(new Error(`${args.label} failed to spawn: ${error.message}`));
    });
    child.on("message", (message) => {
      if (settled || finalizing || !isInstallerGuardMessage(message)) return;
      if (message.type === "ghostinit:ready") {
        if (readinessTimeout !== undefined) {
          clearTimeout(readinessTimeout);
          readinessTimeout = undefined;
        }
        if (process.platform !== "win32") startCommand();
        else {
          const pid = child.pid;
          if (pid === undefined) {
            void failAfterVerifiedCleanup(
              new InstallerContainmentUnavailableError(
                "Windows installer lifecycle is fundamentally unsandboxable because the waiting guard has no PID",
              ),
            );
            return;
          }
          if (pendingWindowsJob) return;
          pendingWindowsJob = createWindowsInstallerJob(pid, expectedBunVersion);
          void pendingWindowsJob
            .then((job) => {
              if (settled || finalizing) return;
              windowsJob = job;
              startCommand();
            })
            .catch((error) => {
              void failAfterVerifiedCleanup(
                error instanceof InstallerContainmentUnavailableError
                  ? error
                  : new InstallerContainmentUnavailableError(
                      `Windows installer lifecycle is fundamentally unsandboxable because Job Object setup failed: ${error instanceof Error ? error.message : String(error)}`,
                      error,
                    ),
              );
            });
        }
        return;
      }
      if (message.type === "ghostinit:spawn-error") {
        void failAfterVerifiedCleanup(
          new Error(`${args.label} failed to spawn: ${message.message}`),
        );
        return;
      }
      exitCode = message.code;
      signal = message.signal;
      if (message.code === 0 && message.signal === null) void succeedAfterVerifiedCleanup();
      else
        void failAfterVerifiedCleanup(
          new Error(
            `${args.label} exited with code ${String(message.code)}${message.signal ? ` (${message.signal})` : ""}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
          ),
        );
    });
    child.once("close", (code, signal) => {
      if (settled || finalizing) return;
      void failAfterVerifiedCleanup(
        new InstallerProcessTreeError(
          `${args.label} guard exited before verified cleanup with code ${String(code)}${signal ? ` (${signal})` : ""}`,
        ),
      );
    });
  });
}

/** Installer callers keep their existing throwing API and sanitized defaults. */
export async function runInstallerCommand(
  args: InstallerCommandInput,
  expectedBunVersion: string,
): Promise<void> {
  const result = await runSupervisedCommand(args, expectedBunVersion);
  if (result.error) throw result.error;
}
