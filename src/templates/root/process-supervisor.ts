// @allow-long 624: OS containment and verified cross-platform shutdown must stay atomic in the generated supervisor
import * as v from "../versions.js";
import { posixProcessGroupHelpersContent } from "../shared/posix-process-groups.js";

export interface ProcessSupervisorOptions {
  readonly hostedEve?: {
    readonly eveScript: string;
    readonly webScript: string;
  };
}

/** Render a Bun-owned, cross-platform supervisor for generated package scripts. */
export function productionProcessSupervisorContent(
  scripts: readonly string[],
  options: ProcessSupervisorOptions = {},
): string {
  return processSupervisorContent(scripts, options, "production");
}

export function developmentProcessSupervisorContent(
  scripts: readonly string[],
  options: ProcessSupervisorOptions,
): string {
  return processSupervisorContent(scripts, options, "development");
}

function processSupervisorContent(
  scripts: readonly string[],
  options: ProcessSupervisorOptions,
  mode: "production" | "development",
): string {
  const processScripts = `[${scripts.map((script) => JSON.stringify(script)).join(", ")}]`;
  const eveScript = options.hostedEve?.eveScript ?? null;
  const webScript = options.hostedEve?.webScript ?? null;
  const label = mode === "development" ? "Development" : "Production";
  const originVariable = mode === "development" ? "EVE_BASE_URL" : "EVE_NEXT_PRODUCTION_ORIGIN";
  return `import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const EXPECTED_BUN_VERSION = ${JSON.stringify(v.runtime.bun)};
const CONFIGURED_PROCESS_SCRIPTS = ${processScripts};
const EVE_PROCESS_SCRIPT = ${JSON.stringify(eveScript)};
const WEB_PROCESS_SCRIPT = ${JSON.stringify(webScript)};
const EVE_PORT_ENV = "EVE_NEXT_PRODUCTION_PORT";
const DEFAULT_EVE_PORT = 4274;
const DEFAULT_WEB_PORT = 3000;
const LOOPBACK_HOST = "127.0.0.1";
// Nested jobs supervision owns a 10s graceful + 5s forced shutdown budget.
// The outer deployment supervisor must not kill that wrapper before it finishes.
// All top-level trees are stopped concurrently so this remains a total budget,
// rather than multiplying the grace period by the number of processes.
const GRACE_MS = 20_000;
const FORCED_MS = 5_000;
const POLL_MS = 50;
const SCOPE_ENV = "GHOSTINIT_PROCESS_SCOPE_ID";
const WINDOWS_JOB_LAUNCHER_ARG = "--ghostinit-windows-job-launcher";
const WINDOWS_JOB_ADMISSION = "ghostinit:windows-job-assigned";
const SUPERVISOR_PATH = fileURLToPath(import.meta.url);
${mode === "development" ? 'process.env.NODE_ENV = "development";\n' : ""}

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  throw new Error(
    "${label} supervision requires Bun " +
      EXPECTED_BUN_VERSION +
      "; received " +
      (typeof Bun === "undefined" ? "a non-Bun runtime" : Bun.version),
  );
}
if (CONFIGURED_PROCESS_SCRIPTS.length === 0) throw new Error("No ${mode} process was configured");

function configuredPort(name, fallback) {
  const source = process.env[name]?.trim();
  if (!source) return fallback;
  if (!/^[1-9]\\d{0,4}$/.test(source)) {
    throw new Error(name + " must be an integer between 1 and 65535");
  }
  const port = Number(source);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(name + " must be an integer between 1 and 65535");
  }
  return port;
}

function configuredEveTopology() {
  if (EVE_PROCESS_SCRIPT === null) {
    return { local: false, origin: null, port: null };
  }
  // Vercel's withEve build-output service owns the runtime. A package start
  // command must never create a second local process there.
  ${mode === "production" ? "if (process.env.VERCEL) return { local: false, origin: null, port: null };" : ""}
  const port = configuredPort(EVE_PORT_ENV, DEFAULT_EVE_PORT);
  const configured = process.env.${originVariable}?.trim();
  if (!configured) {
    return { local: true, origin: "http://" + LOOPBACK_HOST + ":" + String(port), port };
  }
  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("${originVariable} must be an absolute HTTPS or loopback URL");
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  ) {
    throw new Error("${originVariable} must be an absolute HTTPS or loopback URL");
  }
  if (!loopback) return { local: false, origin: url.origin, port: null };
  const originPort = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (originPort !== port) {
    throw new Error("${originVariable} port must match " + EVE_PORT_ENV);
  }
  return { local: true, origin: url.origin, port };
}

const EVE_TOPOLOGY = configuredEveTopology();
if (EVE_TOPOLOGY.origin !== null) {
  process.env.EVE_NEXT_PRODUCTION_ORIGIN = EVE_TOPOLOGY.origin;
  ${mode === "development" ? "process.env.EVE_BASE_URL = EVE_TOPOLOGY.origin;" : ""}
}
const WEB_PORT = configuredPort("PORT", DEFAULT_WEB_PORT);
if (EVE_TOPOLOGY.local && EVE_TOPOLOGY.port === WEB_PORT) {
  throw new Error("PORT and " + EVE_PORT_ENV + " must use different ports");
}
const PROCESS_SCRIPTS = CONFIGURED_PROCESS_SCRIPTS.filter(
  (script) => script !== EVE_PROCESS_SCRIPT || EVE_TOPOLOGY.local,
);

function environmentForScript(script, additions = {}) {
  return {
    ...process.env,
    ...additions,
    ...(script === EVE_PROCESS_SCRIPT && EVE_TOPOLOGY.port !== null
      ? {
          HOST: LOOPBACK_HOST,
          NITRO_HOST: LOOPBACK_HOST,
          NITRO_PORT: String(EVE_TOPOLOGY.port),
          PORT: String(EVE_TOPOLOGY.port),
        }
      : {}),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

${posixProcessGroupHelpersContent({
  label,
  inspectionTimeoutExpression: "FORCED_MS",
})}

function startupTimeoutMs() {
  const source = process.env.GHOSTINIT_STARTUP_TIMEOUT_MS?.trim();
  if (!source) return 30_000;
  if (!/^\\d+$/.test(source)) {
    throw new Error("GHOSTINIT_STARTUP_TIMEOUT_MS must be between 1000 and 300000");
  }
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 300_000) {
    throw new Error("GHOSTINIT_STARTUP_TIMEOUT_MS must be between 1000 and 300000");
  }
  return value;
}

async function waitForTcpPort(port, label) {
  const deadline = Date.now() + startupTimeoutMs();
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = createConnection({ host: LOOPBACK_HOST, port });
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(500, () => finish(false));
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });
    if (ready) return;
    await sleep(100);
  }
  throw new Error(label + " did not listen on " + LOOPBACK_HOST + ":" + String(port));
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
    await sleep(POLL_MS);
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
    timeout: FORCED_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Could not inspect the macOS ${mode} process scope: " +
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
  throw new Error("Production process scopes require Windows, Linux, or macOS");
}

function signalScopedProcesses(scope, signal) {
  const pids = scopedProcessIds(scope);
  for (const pid of pids) {
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
    await sleep(POLL_MS);
  }
  return scopedProcessIds(scope).length === 0;
}

async function terminatePosixTree(managed) {
  const pid = managed.child.pid;
  if (pid === undefined) throw new Error(managed.script + ": child PID is unavailable");

  if (processGroupExists(pid)) signalProcessGroup(pid, "SIGTERM");
  signalScopedProcesses(managed.scope, "SIGTERM");
  const [childExited, groupExited, scopeExited] = await Promise.all([
    waitForChildExit(managed.child, GRACE_MS),
    waitForProcessGroupExit(pid, GRACE_MS),
    waitForProcessScopeExit(managed.scope, GRACE_MS),
  ]);
  if (childExited && groupExited && scopeExited) return;

  if (processGroupExists(pid)) signalProcessGroup(pid, "SIGKILL");
  signalScopedProcesses(managed.scope, "SIGKILL");
  const [forcedChildExit, forcedGroupExit, forcedScopeExit] = await Promise.all([
    waitForChildExit(managed.child, FORCED_MS),
    waitForProcessGroupExit(pid, FORCED_MS),
    waitForProcessScopeExit(managed.scope, FORCED_MS),
  ]);
  if (!forcedChildExit || !forcedGroupExit || !forcedScopeExit) {
    throw new Error("Production process scope " + managed.scope + " remained live after SIGKILL");
  }
}

// child_process does not expose CREATE_SUSPENDED. The trusted launcher may only
// wait on its private IPC channel until the parent assigns it to the Job Object.
// Because this Job does not allow breakaway, Windows associates every process
// the admitted launcher creates with the Job before that process can execute.
function waitForWindowsJobAdmission() {
  if (typeof process.send !== "function") {
    return Promise.reject(new Error("Windows ${mode} launcher requires a private IPC channel"));
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
        finish(new Error("Windows ${mode} launcher received invalid admission data"));
        return;
      }
      finish();
    };
    const onDisconnect = () =>
      finish(new Error("Windows ${mode} supervisor disconnected before Job Object admission"));
    process.once("message", onMessage);
    process.once("disconnect", onDisconnect);
  });
}

async function runWindowsJobLauncher(script) {
  if (process.platform !== "win32") {
    throw new Error("The Windows ${mode} launcher cannot run on " + process.platform);
  }
  if (!PROCESS_SCRIPTS.includes(script)) {
    throw new Error("The Windows ${mode} launcher received an unknown script");
  }
  await waitForWindowsJobAdmission();
  const child = spawn(process.execPath, ["run", script], {
    detached: false,
    env: environmentForScript(script),
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  const outcome = await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once("error", (error) => finish({ exitCode: 1, error }));
    child.once("close", (code, signal) => finish({ exitCode: code ?? (signal ? 1 : 0), signal }));
  });
  if (outcome.error) console.error(script + " failed to start: " + outcome.error.message);
  process.exit(outcome.exitCode);
}

const launcherRequested = process.argv[2] === WINDOWS_JOB_LAUNCHER_ARG;
if (launcherRequested) {
  if (process.argv.length !== 4) {
    throw new Error("The Windows ${mode} launcher received invalid arguments");
  }
  await runWindowsJobLauncher(process.argv[3]);
}

async function createWindowsJob() {
  if (process.platform !== "win32") return null;
  if (process.arch === "ia32") throw new Error("Production supervision requires 64-bit Windows");
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
  const handle = kernel.symbols.CreateJobObjectW(null, null);
  if (!handle) {
    const code = kernel.symbols.GetLastError();
    kernel.close();
    throw new Error("Could not create the Windows ${mode} Job Object (error " + code + ")");
  }
  const limits = new Uint8Array(144);
  new DataView(limits.buffer).setUint32(16, 0x00002000, true);
  if (kernel.symbols.SetInformationJobObject(handle, 9, ptr(limits), limits.byteLength) === 0) {
    const code = kernel.symbols.GetLastError();
    kernel.symbols.CloseHandle(handle);
    kernel.close();
    throw new Error("Could not configure the Windows ${mode} Job Object (error " + code + ")");
  }

  let closed = false;
  const activeProcesses = () => {
    const accounting = new Uint8Array(48);
    if (
      kernel.symbols.QueryInformationJobObject(
        handle,
        1,
        ptr(accounting),
        accounting.byteLength,
        null,
      ) === 0
    ) {
      throw new Error(
        "Could not inspect the Windows ${mode} Job Object (error " +
          kernel.symbols.GetLastError() +
          ")",
      );
    }
    return new DataView(accounting.buffer).getUint32(40, true);
  };
  return {
    assign(child, script) {
      const pid = child.pid;
      if (pid === undefined) throw new Error(script + ": child PID is unavailable");
      const processHandle = kernel.symbols.OpenProcess(0x00000101, 0, pid);
      if (!processHandle) {
        throw new Error(
          script +
            ": could not open the Windows child process (error " +
            kernel.symbols.GetLastError() +
            ")",
        );
      }
      try {
        if (kernel.symbols.AssignProcessToJobObject(handle, processHandle) === 0) {
          throw new Error(
            script +
              ": could not enter the Windows ${mode} Job Object (error " +
              kernel.symbols.GetLastError() +
              ")",
          );
        }
      } finally {
        kernel.symbols.CloseHandle(processHandle);
      }
    },
    async terminate() {
      if (kernel.symbols.TerminateJobObject(handle, 1) === 0) {
        throw new Error(
          "Could not terminate the Windows ${mode} Job Object (error " +
            kernel.symbols.GetLastError() +
            ")",
        );
      }
      const deadline = Date.now() + FORCED_MS;
      while (Date.now() < deadline) {
        if (activeProcesses() === 0) return;
        await sleep(POLL_MS);
      }
      if (activeProcesses() !== 0) {
        throw new Error("Windows ${mode} Job Object still has live processes");
      }
    },
    close() {
      if (closed) return;
      closed = true;
      let handleError;
      try {
        if (kernel.symbols.CloseHandle(handle) === 0) {
          handleError = new Error(
            "Could not close the Windows ${mode} Job Object (error " +
              kernel.symbols.GetLastError() +
              ")",
          );
        }
      } catch (error) {
        handleError = error;
      }
      let libraryError;
      try {
        kernel.close();
      } catch (error) {
        libraryError = error;
      }
      const failures = [handleError, libraryError].filter((error) => error !== undefined);
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "Could not close the Windows ${mode} Job Object and FFI library",
        );
      }
    },
  };
}

async function assignWindowsLauncherOrReap(windowsJob, managed) {
  if (!windowsJob) return;
  try {
    windowsJob.assign(managed.child, managed.script);
  } catch (assignmentError) {
    try {
      if (managed.child.connected) managed.child.disconnect();
    } catch {}
    try {
      if (managed.child.exitCode === null && managed.child.signalCode === null) {
        managed.child.kill("SIGKILL");
      }
    } catch {}
    const reaped = await waitForChildExit(managed.child, FORCED_MS);
    if (!reaped) {
      throw new AggregateError(
        [assignmentError],
        managed.script + ": unassigned Windows ${mode} launcher could not be reaped",
      );
    }
    throw assignmentError;
  }
}

async function cleanupStartedProcesses(windowsJob, children) {
  const results = windowsJob
    ? await (async () => {
        const termination = await Promise.allSettled([windowsJob.terminate()]);
        // Closing is also the KILL_ON_JOB_CLOSE fallback if explicit termination failed.
        const closure = await Promise.allSettled([
          Promise.resolve().then(() => windowsJob.close()),
        ]);
        const reaping = await Promise.allSettled(
          children.map(async (managed) => {
            if (!(await waitForChildExit(managed.child, FORCED_MS + 1_000))) {
              throw new Error(managed.script + ": Windows ${mode} launcher could not be reaped");
            }
          }),
        );
        return [...termination, ...closure, ...reaping];
      })()
    : await Promise.allSettled(children.map((managed) => terminatePosixTree(managed)));
  return results.filter((result) => result.status === "rejected").map((result) => result.reason);
}

const windowsJob = await createWindowsJob();
const children = [];
try {
  for (const script of PROCESS_SCRIPTS) {
    const scope = "ghostinit-${mode}-" + randomUUID();
    const childEnv = windowsJob
      ? { ...process.env, [SCOPE_ENV]: scope }
      : environmentForScript(script, { [SCOPE_ENV]: scope });
    const child = spawn(
      process.execPath,
      windowsJob ? [SUPERVISOR_PATH, WINDOWS_JOB_LAUNCHER_ARG, script] : ["run", script],
      {
        detached: process.platform !== "win32",
        env: childEnv,
        shell: false,
        stdio: windowsJob ? ["inherit", "inherit", "inherit", "ipc"] : "inherit",
        windowsHide: true,
      },
    );
    const outcome = new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      child.once("error", (error) => finish({ script, exitCode: 1, error }));
      child.once("close", (code, signal) =>
        finish({ script, exitCode: code ?? (signal ? 1 : 0), signal }),
      );
    });
    const managed = { script, scope, child, outcome };
    children.push(managed);
    // Admission happens only after every trusted launcher has entered the Job.
    // A failed assignment reaps the still-blocked launcher before propagating.
    await assignWindowsLauncherOrReap(windowsJob, managed);
  }
  if (windowsJob) await Promise.all(children.map(admitWindowsLauncher));
} catch (startupError) {
  const cleanupFailures = await cleanupStartedProcesses(windowsJob, children);
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      [startupError, ...cleanupFailures],
      "${label} launcher setup and containment cleanup failed",
    );
  }
  throw startupError;
}

function admitWindowsLauncher(managed) {
  return new Promise((resolve, reject) => {
    if (!managed.child.connected || typeof managed.child.send !== "function") {
      reject(new Error(managed.script + ": Windows ${mode} launcher IPC is unavailable"));
      return;
    }
    managed.child.send(WINDOWS_JOB_ADMISSION, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

const outcomes = children.map(({ outcome }) => outcome);

let shutdownPromise;
async function shutdown(exitCode) {
  shutdownPromise ??= (async () => {
    const failures = (await cleanupStartedProcesses(windowsJob, children)).map(String);
    if (failures.length > 0) {
      console.error("${label} process cleanup failed:\\n- " + failures.join("\\n- "));
      process.exit(1);
    }
    process.exit(exitCode);
  })();
  return await shutdownPromise;
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

if (WEB_PROCESS_SCRIPT !== null${mode === "production" ? " && !process.env.VERCEL" : ""}) {
  const readiness = Promise.all([
    ...(PROCESS_SCRIPTS.includes(WEB_PROCESS_SCRIPT)
      ? [waitForTcpPort(WEB_PORT, "Web process")]
      : []),
    ...(EVE_TOPOLOGY.local && EVE_TOPOLOGY.port !== null
      ? [waitForTcpPort(EVE_TOPOLOGY.port, "Eve process")]
      : []),
  ]).then(
    () => ({ kind: "ready" }),
    (error) => ({ kind: "readiness-error", error }),
  );
  const startup = await Promise.race([
    readiness,
    ...outcomes.map((outcome) => outcome.then((value) => ({ kind: "exit", value }))),
  ]);
  if (startup.kind === "exit") {
    if (startup.value.error) {
      console.error(startup.value.script + " failed to start: " + startup.value.error.message);
    }
    await shutdown(startup.value.exitCode > 0 ? startup.value.exitCode : 1);
  }
  if (startup.kind === "readiness-error") {
    console.error(startup.error instanceof Error ? startup.error.message : String(startup.error));
    await shutdown(1);
  }
  console.log("[ghostinit] ${mode} processes ready");
}

const first = await Promise.race(outcomes);
if (first.error) console.error(first.script + " failed to start: " + first.error.message);
// Every supervised command is expected to remain live. A clean early exit is
// therefore still a production failure and must trigger on-failure restarts.
await shutdown(first.exitCode > 0 ? first.exitCode : 1);
`;
}
