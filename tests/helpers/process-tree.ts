// @allow-long 334: cross-platform discovery, termination, and verification stay together so cleanup cannot fail open
import { spawn, type ChildProcess } from "node:child_process";

export interface TaskkillOutcome {
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
  spawnError?: Error;
}

export interface CapturedCommandOutcome extends TaskkillOutcome {
  stdout: string;
}

interface WindowsProcessRecord {
  pid: number;
  parentPid: number;
}

export class ProcessTreeTerminationError extends Error {}

const describeRoots = (rootPids: number[]): string =>
  rootPids.length === 1 ? `root PID ${rootPids[0]}` : `root PIDs ${rootPids.join(",")}`;

export function assertSuccessfulTaskkill(pid: number, outcome: TaskkillOutcome): void {
  if (outcome.spawnError) {
    throw new ProcessTreeTerminationError(
      `taskkill for PID ${pid} failed to spawn: ${outcome.spawnError.message}`,
    );
  }
  if (outcome.timedOut) throw new ProcessTreeTerminationError(`taskkill for PID ${pid} timed out`);
  if (outcome.status !== 0 || outcome.signal !== null) {
    const detail = outcome.stderr.trim();
    throw new ProcessTreeTerminationError(
      `taskkill for PID ${pid} failed with status ${String(outcome.status)}${detail ? `: ${detail}` : ""}`,
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseWindowsProcessQuery(
  rootPids: number[],
  outcome: CapturedCommandOutcome,
): WindowsProcessRecord[] {
  const roots = describeRoots(rootPids);
  if (outcome.spawnError) {
    throw new ProcessTreeTerminationError(
      `CIM process discovery failed to spawn for ${roots}: ${outcome.spawnError.message}`,
    );
  }
  if (outcome.timedOut) {
    throw new ProcessTreeTerminationError(`CIM process discovery timed out for ${roots}`);
  }
  if (outcome.status !== 0 || outcome.signal !== null) {
    const detail = outcome.stderr.trim();
    throw new ProcessTreeTerminationError(
      `CIM process discovery failed for ${roots} with status ${String(outcome.status)}${detail ? `: ${detail}` : ""}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch {
    throw new ProcessTreeTerminationError(
      `CIM process discovery returned invalid JSON for ${roots}`,
    );
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (entry) =>
        isObject(entry) &&
        Number.isInteger(entry.pid) &&
        Number(entry.pid) > 0 &&
        Number.isInteger(entry.parentPid) &&
        Number(entry.parentPid) >= 0,
    )
  ) {
    throw new ProcessTreeTerminationError(
      `CIM process discovery returned an invalid process list for ${roots}`,
    );
  }
  return parsed.map((entry) => ({
    pid: Number(entry.pid),
    parentPid: Number(entry.parentPid),
  }));
}

async function runCapturedCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CapturedCommandOutcome> {
  let child: ChildProcess;
  try {
    child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    return {
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      spawnError: error instanceof Error ? error : new Error(String(error)),
    };
  }

  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  return await new Promise<CapturedCommandOutcome>((resolveOutcome) => {
    let settled = false;
    const finish = (result: CapturedCommandOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("close", closed);
      child.off("error", errored);
      resolveOutcome(result);
    };
    const closed = (status: number | null, signal: NodeJS.Signals | null): void =>
      finish({ status, signal, stdout, stderr, timedOut: false });
    const errored = (error: Error): void =>
      finish({
        status: null,
        signal: null,
        stdout,
        stderr,
        timedOut: false,
        spawnError: error,
      });
    const timer = setTimeout(() => {
      child.kill();
      finish({
        status: child.exitCode,
        signal: child.signalCode,
        stdout,
        stderr,
        timedOut: true,
      });
    }, timeoutMs);
    child.once("close", closed);
    child.once("error", errored);
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise<boolean>((resolveExit) => {
    const exited = (): void => finish(true);
    const errored = (): void => finish(false);
    const finish = (result: boolean): void => {
      clearTimeout(timer);
      child.off("exit", exited);
      child.off("error", errored);
      resolveExit(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", exited);
    child.once("error", errored);
  });
}

function processGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processGroupExists(pid)) return true;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 50));
  }
  return false;
}

async function runWindowsTaskkill(pid: number): Promise<void> {
  const outcome = await runCapturedCommand("taskkill", ["/PID", String(pid), "/T", "/F"], 10_000);
  assertSuccessfulTaskkill(pid, outcome);
}

function resolvePowerShell(): string {
  const executable = Bun.which("powershell") ?? Bun.which("pwsh");
  if (executable === null) {
    throw new ProcessTreeTerminationError(
      "CIM process discovery failed because PowerShell was not found",
    );
  }
  return executable;
}

async function discoverWindowsProcessTree(rootPids: number[]): Promise<WindowsProcessRecord[]> {
  const uniqueRoots = [...new Set(rootPids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (uniqueRoots.length === 0) {
    throw new ProcessTreeTerminationError("CIM process discovery requires at least one root PID");
  }
  const seeds = uniqueRoots.join(",");
  const script = `$ErrorActionPreference = "Stop"
$seeds = @(${seeds})
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
$found = @{}
$frontier = @($seeds)
foreach ($process in $all) {
  $processId = [int]$process.ProcessId
  if ($seeds -contains $processId) { $found[[string]$processId] = $true }
}
while ($frontier.Count -gt 0) {
  $next = @()
  foreach ($process in $all) {
    $processId = [int]$process.ProcessId
    $parentId = [int]$process.ParentProcessId
    if (($frontier -contains $parentId) -and -not $found.ContainsKey([string]$processId)) {
      $found[[string]$processId] = $true
      $next += $processId
    }
  }
  $frontier = @($next)
}
$result = @($all | Where-Object { $found.ContainsKey([string][int]$_.ProcessId) } | ForEach-Object {
  [pscustomobject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId }
})
ConvertTo-Json -InputObject @($result) -Compress`;
  const outcome = await runCapturedCommand(
    resolvePowerShell(),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    10_000,
  );
  return parseWindowsProcessQuery(uniqueRoots, outcome);
}

function topLevelWindowsProcesses(records: WindowsProcessRecord[]): WindowsProcessRecord[] {
  const ids = new Set(records.map(({ pid }) => pid));
  return records.filter(({ parentPid }) => !ids.has(parentPid));
}

async function terminateWindowsTree(child: ChildProcess, rootPid: number): Promise<void> {
  const tracked = new Set<number>([rootPid]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const records = await discoverWindowsProcessTree([...tracked]);
    for (const { pid } of records) tracked.add(pid);
    if (records.length === 0) {
      if (child.exitCode === null && child.signalCode === null) {
        throw new ProcessTreeTerminationError(
          `CIM process discovery could not find live root PID ${rootPid}`,
        );
      }
      return;
    }
    for (const { pid } of topLevelWindowsProcesses(records)) await runWindowsTaskkill(pid);
    await waitForExit(child, 5_000);
  }

  const remaining = await discoverWindowsProcessTree([...tracked]);
  if (remaining.length > 0) {
    throw new ProcessTreeTerminationError(
      `Windows process tree ${rootPid} still has tracked PIDs after taskkill`,
    );
  }
  if (!(await waitForExit(child, 5_000))) {
    throw new ProcessTreeTerminationError(
      `Windows process tree ${rootPid} remained alive after successful taskkill`,
    );
  }
}

async function terminatePosixGroup(child: ChildProcess, rootPid: number): Promise<void> {
  if (!processGroupExists(rootPid)) {
    if (child.exitCode === null && child.signalCode === null) {
      throw new ProcessTreeTerminationError(
        `POSIX process group ${rootPid} was missing while its root remained alive`,
      );
    }
    return;
  }

  try {
    process.kill(-rootPid, "SIGTERM");
  } catch (error) {
    throw new ProcessTreeTerminationError(
      `POSIX process group ${rootPid} could not receive SIGTERM: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const childExitedAfterTerm = await waitForExit(child, 2_000);
  const groupExitedAfterTerm = await waitForProcessGroupExit(rootPid, 2_000);
  if (childExitedAfterTerm && groupExitedAfterTerm) return;

  try {
    process.kill(-rootPid, "SIGKILL");
  } catch (error) {
    if (processGroupExists(rootPid)) {
      throw new ProcessTreeTerminationError(
        `POSIX process group ${rootPid} could not receive SIGKILL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const childExitedAfterKill = await waitForExit(child, 5_000);
  const groupExitedAfterKill = await waitForProcessGroupExit(rootPid, 5_000);
  if (!childExitedAfterKill || !groupExitedAfterKill) {
    throw new ProcessTreeTerminationError(
      `POSIX process group ${rootPid} did not terminate after SIGKILL`,
    );
  }
}

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) {
    throw new ProcessTreeTerminationError(
      "Cannot discover or terminate a process tree without its root PID",
    );
  }
  if (process.platform === "win32") await terminateWindowsTree(child, pid);
  else await terminatePosixGroup(child, pid);
}
