// @allow-long 560: generated cross-platform containment must remain reviewable as one lifecycle
import type { ProjectMode } from "../../../lib/addons.js";
import * as v from "../../versions.js";

export function startPostgresJobsSupervisorContent(
  mode: ProjectMode,
  userFacingApi = true,
): string {
  const root =
    mode === "monorepo"
      ? userFacingApi
        ? "packages/api/src/workers/jobs"
        : "packages/jobs-runtime/src/workers/jobs"
      : "src/server/workers/jobs";
  return `import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN_VERSION = ${JSON.stringify(v.runtime.bun)};
const workerRoot = ${JSON.stringify(root)};
// The deployment supervisor reserves 20s graceful + 5s forced shutdown. Keep
// this nested 10s + 5s budget inside that outer graceful window.
const gracefulShutdownMs = 10_000;
const forcedShutdownMs = 5_000;
const pollMs = 50;
const SCOPE_ENV = "GHOSTINIT_JOBS_PROCESS_SCOPE_ID";
const WINDOWS_JOB_LAUNCHER_ARG = "--ghostinit-windows-jobs-launcher";
const WINDOWS_JOB_ADMISSION = "ghostinit:windows-jobs-job-assigned";
const SUPERVISOR_PATH = fileURLToPath(import.meta.url);
const jobProcesses = [
  { name: "worker", entrypoint: workerRoot + "/worker.ts" },
  { name: "scheduler", entrypoint: workerRoot + "/scheduler.ts" },
];

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  throw new Error(
    "Jobs supervision requires Bun " + EXPECTED_BUN_VERSION +
      "; received " + (typeof Bun === "undefined" ? "a non-Bun runtime" : Bun.version),
  );
}

function parseRuntime(argv) {
  let runtime = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument.startsWith("--runtime=")) {
      runtime = argument.slice("--runtime=".length);
      continue;
    }
    if (argument === "--runtime") {
      runtime = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    throw new Error("Unknown jobs supervisor argument: " + argument);
  }
  if (runtime !== "bun" && runtime !== "node") {
    throw new Error("The jobs supervisor requires --runtime=bun or --runtime=node");
  }
  return runtime;
}

function assertRuntime(runtime) {
  if (runtime !== "bun" && runtime !== "node") {
    throw new Error("The Windows jobs launcher received an invalid runtime");
  }
  return runtime;
}

function runtimeCommand(runtime, entrypoint) {
  if (runtime === "bun") {
    // The supervisor and trusted Windows launcher are both package-manager Bun,
    // preserving the exact selected executable instead of consulting PATH.
    return {
      executable: process.execPath,
      arguments: ["--conditions=react-server", entrypoint],
    };
  }
  return {
    executable: "node",
    arguments: [
      "--import",
      "./scripts/typescript-worker-loader.mjs",
      "--conditions=react-server",
      "--experimental-strip-types",
      entrypoint,
    ],
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function signalProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("close", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
    child.once("close", onExit);
  });
}

async function waitForProcessGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processGroupExists(pid)) return true;
    await sleep(pollMs);
  }
  return !processGroupExists(pid);
}

function linuxScopedProcessIds(scope) {
  const expected = SCOPE_ENV + "=" + scope;
  const result = [];
  for (const entry of readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\\d+$/.test(entry.name)) continue;
    const pid = Number.parseInt(entry.name, 10);
    if (pid === process.pid) continue;
    try {
      const environment = readFileSync("/proc/" + entry.name + "/environ", "utf8");
      if (environment.split("\\0").includes(expected)) result.push(pid);
    } catch (error) {
      if (!["ENOENT", "EACCES", "EPERM"].includes(error?.code)) throw error;
    }
  }
  return result;
}

function macScopedProcessIds(scope) {
  const expected = SCOPE_ENV + "=" + scope;
  const result = spawnSync("/bin/ps", ["-A", "-ww", "-E", "-o", "pid=", "-o", "command="], {
    encoding: "utf8",
    shell: false,
    timeout: forcedShutdownMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Could not inspect the macOS jobs process scope: " +
        (result.error?.message || String(result.stderr || result.status)),
    );
  }
  return result.stdout
    .split("\\n")
    .filter((line) => line.includes(expected))
    .map((line) => Number.parseInt(line.trimStart().split(/\\s+/, 1)[0], 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

function scopedProcessIds(scope) {
  if (process.platform === "linux") return linuxScopedProcessIds(scope);
  if (process.platform === "darwin") return macScopedProcessIds(scope);
  throw new Error("Jobs process scopes require Windows, Linux, or macOS");
}

function signalScopedProcesses(scope, signal) {
  for (const pid of scopedProcessIds(scope)) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

async function waitForProcessScopeExit(scope, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (scopedProcessIds(scope).length === 0) return true;
    await sleep(pollMs);
  }
  return scopedProcessIds(scope).length === 0;
}

async function terminatePosixTree(managed, signal) {
  const pid = managed.child.pid;
  if (pid === undefined) throw new Error(managed.name + ": child PID is unavailable");

  if (processGroupExists(pid)) signalProcessGroup(pid, signal);
  signalScopedProcesses(managed.scope, signal);
  const [childExited, groupExited, scopeExited] = await Promise.all([
    waitForChildExit(managed.child, gracefulShutdownMs),
    waitForProcessGroupExit(pid, gracefulShutdownMs),
    waitForProcessScopeExit(managed.scope, gracefulShutdownMs),
  ]);
  if (childExited && groupExited && scopeExited) return;

  if (processGroupExists(pid)) signalProcessGroup(pid, "SIGKILL");
  signalScopedProcesses(managed.scope, "SIGKILL");
  const [forcedChildExit, forcedGroupExit, forcedScopeExit] = await Promise.all([
    waitForChildExit(managed.child, forcedShutdownMs),
    waitForProcessGroupExit(pid, forcedShutdownMs),
    waitForProcessScopeExit(managed.scope, forcedShutdownMs),
  ]);
  if (!forcedChildExit || !forcedGroupExit || !forcedScopeExit) {
    throw new Error("Jobs process scope " + managed.scope + " remained live after SIGKILL");
  }
}

// child_process cannot request CREATE_SUSPENDED. This trusted launcher executes
// no workload before its private IPC channel confirms Job Object assignment.
// With breakaway disabled, every worker descendant enters the Job atomically.
function waitForWindowsJobAdmission() {
  if (typeof process.send !== "function") {
    return Promise.reject(new Error("Windows jobs launcher requires a private IPC channel"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      process.off("message", onMessage);
      process.off("disconnect", onDisconnect);
      if (error) reject(error);
      else resolve();
    };
    const onMessage = (message) => {
      if (message !== WINDOWS_JOB_ADMISSION) {
        finish(new Error("Windows jobs launcher received invalid admission data"));
        return;
      }
      finish();
    };
    const onDisconnect = () =>
      finish(new Error("Jobs supervisor disconnected before Windows Job Object admission"));
    process.once("message", onMessage);
    process.once("disconnect", onDisconnect);
  });
}

async function runWindowsJobLauncher(runtime, name) {
  if (process.platform !== "win32") {
    throw new Error("The Windows jobs launcher cannot run on " + process.platform);
  }
  const selected = jobProcesses.find((candidate) => candidate.name === name);
  if (!selected) throw new Error("The Windows jobs launcher received an unknown process name");
  const command = runtimeCommand(assertRuntime(runtime), selected.entrypoint);
  await waitForWindowsJobAdmission();
  const child = spawn(command.executable, command.arguments, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    detached: false,
  });
  const outcome = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => finish({ code: 1, error }));
    child.once("close", (code, signal) => finish({ code: code ?? (signal ? 1 : 0), signal }));
  });
  if (outcome.error) console.error("[jobs] " + name + " failed to start: " + outcome.error.message);
  process.exit(outcome.code);
}

const launcherRequested = process.argv[2] === WINDOWS_JOB_LAUNCHER_ARG;
if (launcherRequested) {
  if (process.argv.length !== 5) {
    throw new Error("The Windows jobs launcher received invalid arguments");
  }
  await runWindowsJobLauncher(process.argv[3], process.argv[4]);
}

async function createWindowsJob() {
  if (process.platform !== "win32") return null;
  if (process.arch === "ia32") throw new Error("Jobs supervision requires 64-bit Windows");
  const { dlopen, ptr } = await import("bun:ffi");
  const kernel = dlopen("kernel32.dll", {
    CreateJobObjectW: { args: ["ptr", "ptr"], returns: "ptr" },
    SetInformationJobObject: { args: ["ptr", "u32", "ptr", "u32"], returns: "bool" },
    OpenProcess: { args: ["u32", "bool", "u32"], returns: "ptr" },
    AssignProcessToJobObject: { args: ["ptr", "ptr"], returns: "bool" },
    TerminateJobObject: { args: ["ptr", "u32"], returns: "bool" },
    QueryInformationJobObject: {
      args: ["ptr", "u32", "ptr", "u32", "ptr"],
      returns: "bool",
    },
    CloseHandle: { args: ["ptr"], returns: "bool" },
    GetLastError: { args: [], returns: "u32" },
  });
  const handle = kernel.symbols.CreateJobObjectW(null, null);
  if (!handle) {
    const code = kernel.symbols.GetLastError();
    kernel.close();
    throw new Error("Could not create the Windows jobs Job Object (error " + code + ")");
  }
  const limits = new Uint8Array(144);
  // JOBOBJECT_EXTENDED_LIMIT_INFORMATION.BasicLimitInformation.LimitFlags
  // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, with breakaway intentionally absent.
  new DataView(limits.buffer).setUint32(16, 0x00002000, true);
  if (!kernel.symbols.SetInformationJobObject(handle, 9, ptr(limits), limits.byteLength)) {
    const code = kernel.symbols.GetLastError();
    kernel.symbols.CloseHandle(handle);
    kernel.close();
    throw new Error("Could not configure the Windows jobs Job Object (error " + code + ")");
  }

  let closed = false;
  const activeProcesses = () => {
    const accounting = new Uint8Array(48);
    if (
      !kernel.symbols.QueryInformationJobObject(
        handle,
        1,
        ptr(accounting),
        accounting.byteLength,
        null,
      )
    ) {
      throw new Error(
        "Could not inspect the Windows jobs Job Object (error " +
          kernel.symbols.GetLastError() +
          ")",
      );
    }
    return new DataView(accounting.buffer).getUint32(40, true);
  };
  return {
    assign(child, name) {
      const pid = child.pid;
      if (pid === undefined) throw new Error(name + ": child PID is unavailable");
      const processHandle = kernel.symbols.OpenProcess(0x00000101, false, pid);
      if (!processHandle) {
        throw new Error(
          name + ": could not open the Windows jobs launcher (error " +
            kernel.symbols.GetLastError() + ")",
        );
      }
      try {
        if (!kernel.symbols.AssignProcessToJobObject(handle, processHandle)) {
          throw new Error(
            name + ": could not enter the Windows jobs Job Object (error " +
              kernel.symbols.GetLastError() + ")",
          );
        }
      } finally {
        kernel.symbols.CloseHandle(processHandle);
      }
    },
    async terminate() {
      if (activeProcesses() === 0) return;
      if (!kernel.symbols.TerminateJobObject(handle, 1)) {
        throw new Error(
          "Could not terminate the Windows jobs Job Object (error " +
            kernel.symbols.GetLastError() + ")",
        );
      }
      const deadline = Date.now() + forcedShutdownMs;
      while (Date.now() < deadline) {
        if (activeProcesses() === 0) return;
        await sleep(pollMs);
      }
      if (activeProcesses() !== 0) {
        throw new Error("Windows jobs Job Object still has live processes");
      }
    },
    close() {
      if (closed) return;
      closed = true;
      kernel.symbols.CloseHandle(handle);
      kernel.close();
    },
  };
}

function launch(name, runtime, entrypoint, windowsJob) {
  const scope = "ghostinit-jobs-" + name + "-" + randomUUID();
  const command = runtimeCommand(runtime, entrypoint);
  const child = spawn(
    windowsJob ? process.execPath : command.executable,
    windowsJob
      ? [SUPERVISOR_PATH, WINDOWS_JOB_LAUNCHER_ARG, runtime, name]
      : command.arguments,
    {
      cwd: process.cwd(),
      env: { ...process.env, [SCOPE_ENV]: scope },
      stdio: windowsJob ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  const outcome = new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => finish({ name, child, code: null, signal: null, error }));
    child.once("close", (code, signal) => finish({ name, child, code, signal, error: null }));
  });
  const managed = { name, scope, child, outcome };
  windowsJob?.assign(child, name);
  return managed;
}

function admitWindowsLauncher(managed) {
  return new Promise((resolve, reject) => {
    if (!managed.child.connected || typeof managed.child.send !== "function") {
      reject(new Error(managed.name + ": Windows jobs launcher IPC is unavailable"));
      return;
    }
    managed.child.send(WINDOWS_JOB_ADMISSION, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function describeOutcome(outcome) {
  if (outcome.error) return outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
  if (outcome.signal) return "signal " + outcome.signal;
  return "exit code " + String(outcome.code);
}

let requestShutdown;
const shutdownRequested = new Promise((resolve) => {
  requestShutdown = resolve;
});
const signalHandlers = new Map();
for (const signal of [
  "SIGINT",
  "SIGTERM",
  "SIGHUP",
  ...(process.platform === "win32" ? ["SIGBREAK"] : []),
]) {
  const handler = () => requestShutdown({ type: "shutdown", signal });
  signalHandlers.set(signal, handler);
  process.once(signal, handler);
}

const runtime = parseRuntime(process.argv.slice(2));
const windowsJob = await createWindowsJob();
const children = [];
let cleanupPromise;
function terminateAll(signal) {
  cleanupPromise ??= (async () => {
    const results = windowsJob
      ? [
          await windowsJob.terminate().then(
            () => ({ status: "fulfilled" }),
            (reason) => ({ status: "rejected", reason }),
          ),
        ]
      : await Promise.allSettled(children.map((managed) => terminatePosixTree(managed, signal)));
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason));
    if (failures.length > 0) throw new Error(failures.join("; "));
  })();
  return cleanupPromise;
}

let exitCode = 0;
try {
  for (const candidate of jobProcesses) {
    children.push(launch(candidate.name, runtime, candidate.entrypoint, windowsJob));
  }
  if (windowsJob) await Promise.all(children.map(admitWindowsLauncher));

  const first = await Promise.race([
    shutdownRequested,
    ...children.map(async (managed) => ({ type: "child", outcome: await managed.outcome })),
  ]);
  if (first.type === "shutdown") {
    await terminateAll(first.signal === "SIGINT" ? "SIGINT" : "SIGTERM");
  } else {
    const outcome = first.outcome;
    console.error("[jobs] " + outcome.name + " stopped unexpectedly: " + describeOutcome(outcome));
    // Clean every containment boundary, including the child whose root already
    // exited. Its detached descendants can remain live in the inherited scope.
    await terminateAll("SIGTERM");
    exitCode = outcome.code && outcome.code > 0 ? outcome.code : 1;
  }
} catch (error) {
  console.error("[jobs] supervisor cleanup failed:", error);
  exitCode = 1;
  try {
    await terminateAll("SIGTERM");
  } catch (cleanupError) {
    console.error("[jobs] supervisor containment failed:", cleanupError);
  }
} finally {
  windowsJob?.close();
  for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
}

process.exitCode = exitCode;
`;
}

export function nodeTypeScriptWorkerLoaderContent(): string {
  return `import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function sourceCandidates(candidate) {
  const extension = extname(candidate);
  if (!extension) return [candidate + ".ts", candidate + ".tsx", candidate + "/index.ts"];
  if (extension === ".js") return [candidate.slice(0, -3) + ".ts", candidate.slice(0, -3) + ".tsx"];
  if (extension === ".jsx") return [candidate.slice(0, -4) + ".tsx"];
  return [];
}

function sourceUrl(candidate) {
  for (const path of sourceCandidates(candidate)) {
    if (existsSync(path)) return pathToFileURL(path).href;
  }
  return null;
}

// Node's type stripper executes .ts but does not infer extensions or tsconfig
// aliases. Resolve the single-mode @/ source root plus relative TypeScript
// siblings; package exports continue through Node's default resolver.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = sourceUrl(resolve(process.cwd(), "src", specifier.slice(2)));
      if (url) return { url, shortCircuit: true };
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:")
    ) {
      const candidate = fileURLToPath(new URL(specifier, context.parentURL));
      const url = sourceUrl(candidate);
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
`;
}
