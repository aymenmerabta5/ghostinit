// @allow-long 551: cross-platform discovery, termination, and verification stay together so cleanup cannot fail open
import { spawn, type ChildProcess } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  listPosixProcessGroupMembers,
  sendPosixProcessGroupSignal,
} from "../../src/lib/posix-process-groups.js";

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

export interface WindowsProcessRecord {
  pid: number;
  parentPid: number;
  createdAt: string;
}

export interface ProcessTreeTerminationOptions {
  /** Time allowed for a POSIX root to finish its own verified descendant cleanup. */
  readonly posixGraceMs?: number;
}

function sameWindowsProcessIdentity(
  left: WindowsProcessRecord,
  right: WindowsProcessRecord,
): boolean {
  return left.pid === right.pid && Date.parse(left.createdAt) === Date.parse(right.createdAt);
}

export class ProcessTreeTerminationError extends Error {}

export function resolveWindowsSystemExecutable(executable: "powershell" | "taskkill"): string {
  if (process.platform !== "win32") {
    throw new ProcessTreeTerminationError("Windows system executable resolution requires Windows");
  }
  const configuredRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!configuredRoot || !isAbsolute(configuredRoot)) {
    throw new ProcessTreeTerminationError("Windows system root is missing or not absolute");
  }
  let system32: string;
  let candidate: string;
  try {
    const canonicalRoot = realpathSync(configuredRoot);
    system32 = realpathSync(resolve(canonicalRoot, "System32"));
    const unresolvedCandidate =
      executable === "taskkill"
        ? resolve(system32, "taskkill.exe")
        : resolve(system32, "WindowsPowerShell", "v1.0", "powershell.exe");
    const metadata = lstatSync(unresolvedCandidate);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("not a regular executable");
    }
    candidate = realpathSync(unresolvedCandidate);
  } catch (error) {
    throw new ProcessTreeTerminationError(
      `Windows ${executable} executable is missing or unsafe: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const descendant = relative(system32, candidate);
  if (
    !descendant ||
    descendant === ".." ||
    descendant.startsWith(".." + sep) ||
    isAbsolute(descendant)
  ) {
    throw new ProcessTreeTerminationError(
      `Windows ${executable} executable escapes the canonical System32 directory`,
    );
  }
  return candidate;
}

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
        Number(entry.parentPid) >= 0 &&
        typeof entry.createdAt === "string" &&
        entry.createdAt.length > 0,
    )
  ) {
    throw new ProcessTreeTerminationError(
      `CIM process discovery returned an invalid process list for ${roots}`,
    );
  }
  return parsed.map((entry) => ({
    pid: Number(entry.pid),
    parentPid: Number(entry.parentPid),
    createdAt: String(entry.createdAt),
  }));
}

export function assertTaskkillCompletedForCapturedProcesses(
  pid: number,
  outcome: TaskkillOutcome,
  captured: readonly WindowsProcessRecord[],
  current: readonly WindowsProcessRecord[],
): void {
  if (
    outcome.spawnError ||
    outcome.timedOut ||
    outcome.signal !== null ||
    outcome.status === null ||
    outcome.status === 0
  ) {
    assertSuccessfulTaskkill(pid, outcome);
    return;
  }

  const capturedIdentities = new Map(captured.map((record) => [record.pid, record.createdAt]));
  const stillLive = current.filter(
    (record) => capturedIdentities.get(record.pid) === record.createdAt,
  );
  if (stillLive.length === 0) return;

  const detail = stillLive.map((record) => `${record.pid}@${record.createdAt}`).join(", ");
  try {
    assertSuccessfulTaskkill(pid, outcome);
  } catch (error) {
    throw new ProcessTreeTerminationError(
      `${error instanceof Error ? error.message : String(error)}; captured processes still live: ${detail}`,
    );
  }
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
    return listPosixProcessGroupMembers(pid).length > 0;
  } catch (error) {
    throw new ProcessTreeTerminationError(
      `POSIX process group ${pid} could not be verified: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function signalPosixProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    sendPosixProcessGroupSignal(pid, signal);
  } catch (error) {
    throw new ProcessTreeTerminationError(
      `POSIX process group ${pid} could not receive ${signal}: ${error instanceof Error ? error.message : String(error)}`,
    );
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

async function runWindowsTaskkill(
  pid: number,
  captured: readonly WindowsProcessRecord[],
): Promise<void> {
  const outcome = await runCapturedCommand(
    resolveWindowsSystemExecutable("taskkill"),
    ["/PID", String(pid), "/T", "/F"],
    10_000,
  );
  if (
    outcome.spawnError ||
    outcome.timedOut ||
    outcome.signal !== null ||
    outcome.status === null
  ) {
    assertSuccessfulTaskkill(pid, outcome);
  }
  const deadline = Date.now() + 5_000;
  let current: WindowsProcessRecord[] = [];
  do {
    current = await queryWindowsProcessIdentities(captured.map((record) => record.pid));
    const stillLive = captured.filter((record) =>
      current.some((candidate) => sameWindowsProcessIdentity(record, candidate)),
    );
    if (stillLive.length === 0) {
      if (outcome.status !== 0) {
        assertTaskkillCompletedForCapturedProcesses(pid, outcome, captured, current);
      }
      return;
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 50));
  } while (Date.now() < deadline);
  assertTaskkillCompletedForCapturedProcesses(pid, outcome, captured, current);
  const detail = captured
    .filter((record) => current.some((candidate) => sameWindowsProcessIdentity(record, candidate)))
    .map((record) => `${record.pid}@${record.createdAt}`)
    .join(", ");
  throw new ProcessTreeTerminationError(
    `taskkill for PID ${pid} returned before captured processes exited: ${detail}`,
  );
}

function resolvePowerShell(): string {
  return resolveWindowsSystemExecutable("powershell");
}

async function queryWindowsProcessIdentities(
  pids: readonly number[],
): Promise<WindowsProcessRecord[]> {
  const unique = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (unique.length === 0) return [];
  const script = `$ErrorActionPreference = "Stop"
$result = @(@(${unique.join(",")}) | ForEach-Object {
  try {
    $process = Get-Process -Id ([int]$_) -ErrorAction Stop
    [void]$process.Handle
    [pscustomobject]@{
      pid = [int]$process.Id
      parentPid = 0
      createdAt = $process.StartTime.ToUniversalTime().ToString("O")
    }
    $process.Dispose()
  } catch {
    # This exact PID is not live.
  }
})
ConvertTo-Json -InputObject @($result) -Compress`;
  const outcome = await runCapturedCommand(
    resolvePowerShell(),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    10_000,
  );
  return parseWindowsProcessQuery([...unique], outcome);
}

/** @internal Captures the exact Windows process identity rather than only its reusable PID. */
export async function captureWindowsProcessIdentity(
  pid: number,
): Promise<WindowsProcessRecord | undefined> {
  if (process.platform !== "win32") return undefined;
  return (await queryWindowsProcessIdentities([pid]))[0];
}

/** @internal Checks whether the same captured Windows process object remains live. */
export async function isCapturedWindowsProcessLive(
  captured: WindowsProcessRecord,
): Promise<boolean> {
  if (process.platform !== "win32") return false;
  return (await queryWindowsProcessIdentities([captured.pid])).some((current) =>
    sameWindowsProcessIdentity(captured, current),
  );
}

async function discoverWindowsProcessTree(rootPids: number[]): Promise<WindowsProcessRecord[]> {
  const uniqueRoots = [...new Set(rootPids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (uniqueRoots.length === 0) {
    throw new ProcessTreeTerminationError("CIM process discovery requires at least one root PID");
  }
  const seeds = uniqueRoots.join(",");
  const script = `$ErrorActionPreference = "Stop"
$seeds = @(${seeds})
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, CreationDate)
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
  $createdAt = ([datetime]$_.CreationDate).ToUniversalTime().ToString("O")
  [pscustomobject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; createdAt = $createdAt }
})
ConvertTo-Json -InputObject @($result) -Compress`;
  const outcome = await runCapturedCommand(
    resolvePowerShell(),
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    10_000,
  );
  return parseWindowsProcessQuery(uniqueRoots, outcome);
}

/** Captures identities while the owned root is alive, before requesting graceful shutdown. */
export async function captureWindowsProcessTree(
  child: ChildProcess,
): Promise<WindowsProcessRecord[]> {
  if (process.platform !== "win32") return [];
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    throw new ProcessTreeTerminationError("Cannot capture an exited Windows preview root");
  }
  const records = await discoverWindowsProcessTree([child.pid]);
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new ProcessTreeTerminationError("Windows preview exited during process-tree capture");
  }
  const captured = trustedWindowsRecords(records, new Map(), child, child.pid);
  if (!captured.some(({ pid }) => pid === child.pid)) {
    throw new ProcessTreeTerminationError("Windows preview root identity could not be captured");
  }
  return captured;
}

/** Verifies graceful shutdown without killing a process that the wrapper left behind. */
export async function assertProcessTreeExited(
  child: ChildProcess,
  captured: readonly WindowsProcessRecord[],
): Promise<void> {
  if (!child.pid || (child.exitCode === null && child.signalCode === null)) {
    throw new ProcessTreeTerminationError("Preview root has not exited");
  }
  if (process.platform !== "win32") {
    if (processGroupExists(child.pid)) {
      throw new ProcessTreeTerminationError("Preview process group remained live after shutdown");
    }
    return;
  }
  if (!captured.some(({ pid }) => pid === child.pid)) {
    throw new ProcessTreeTerminationError("Windows preview root has no captured identity");
  }
  const current = await queryWindowsProcessIdentities(captured.map(({ pid }) => pid));
  if (
    captured.some((record) => current.some((entry) => sameWindowsProcessIdentity(record, entry)))
  ) {
    throw new ProcessTreeTerminationError(
      "Captured Windows preview processes remained live after shutdown",
    );
  }
  // The wrapper owns runtime supervision, including children created after our
  // snapshot. Reject any late ancestry we can still observe, but never signal a
  // process based only on its exited parent's reusable PID.
  const descendants = await discoverWindowsProcessTree(captured.map(({ pid }) => pid));
  if (
    descendants.some((record) =>
      captured.some(
        (parent) =>
          sameWindowsProcessIdentity(record, parent) ||
          (record.parentPid === parent.pid &&
            Date.parse(record.createdAt) >= Date.parse(parent.createdAt)),
      ),
    )
  ) {
    throw new ProcessTreeTerminationError(
      "Unverified late Windows preview descendants remained after shutdown",
    );
  }
}

function topLevelWindowsProcesses(records: WindowsProcessRecord[]): WindowsProcessRecord[] {
  const ids = new Set(records.map(({ pid }) => pid));
  return records.filter(({ parentPid }) => !ids.has(parentPid));
}

function windowsProcessSubtree(
  records: readonly WindowsProcessRecord[],
  rootPid: number,
): WindowsProcessRecord[] {
  const included = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      if (!included.has(record.parentPid) || included.has(record.pid)) continue;
      included.add(record.pid);
      changed = true;
    }
  }
  return records.filter((record) => included.has(record.pid));
}

function trustedWindowsRecords(
  records: readonly WindowsProcessRecord[],
  capturedIdentities: Map<number, string>,
  child: ChildProcess,
  rootPid: number,
): WindowsProcessRecord[] {
  const trusted = new Map<number, WindowsProcessRecord>();
  for (const record of records) {
    const capturedAt = capturedIdentities.get(record.pid);
    if (capturedAt !== undefined && Date.parse(capturedAt) === Date.parse(record.createdAt)) {
      trusted.set(record.pid, record);
    }
  }
  if (child.exitCode === null && child.signalCode === null) {
    const root = records.find(({ pid }) => pid === rootPid);
    if (root) {
      trusted.set(rootPid, root);
      capturedIdentities.set(rootPid, root.createdAt);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      if (trusted.has(record.pid)) continue;
      const parent = trusted.get(record.parentPid);
      if (!parent || Date.parse(record.createdAt) < Date.parse(parent.createdAt)) continue;
      trusted.set(record.pid, record);
      capturedIdentities.set(record.pid, record.createdAt);
      changed = true;
    }
  }
  return [...trusted.values()];
}

async function terminateWindowsTree(
  child: ChildProcess,
  rootPid: number,
  initiallyCaptured: readonly WindowsProcessRecord[],
): Promise<void> {
  if (initiallyCaptured.length === 0 && (child.exitCode !== null || child.signalCode !== null)) {
    throw new ProcessTreeTerminationError(
      `Windows root PID ${rootPid} already exited without a captured identity; refusing unsafe PID-only descendant discovery`,
    );
  }
  const tracked = new Set<number>([rootPid, ...initiallyCaptured.map(({ pid }) => pid)]);
  const capturedIdentities = new Map<number, string>(
    initiallyCaptured.map(({ pid, createdAt }) => [pid, createdAt]),
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    const records = await discoverWindowsProcessTree([...tracked]);
    const trusted = trustedWindowsRecords(records, capturedIdentities, child, rootPid);
    for (const { pid } of trusted) {
      tracked.add(pid);
    }
    if (trusted.length === 0) {
      if (child.exitCode === null && child.signalCode === null) {
        throw new ProcessTreeTerminationError(
          `CIM process discovery could not verify live root PID ${rootPid}`,
        );
      }
      const current = await queryWindowsProcessIdentities([...capturedIdentities.keys()]);
      if (
        ![...capturedIdentities].some(([pid, createdAt]) =>
          current.some(
            (record) =>
              pid === record.pid && Date.parse(createdAt) === Date.parse(record.createdAt),
          ),
        )
      ) {
        return;
      }
      throw new ProcessTreeTerminationError(
        `Captured descendants of Windows root PID ${rootPid} remained live but could not be safely rediscovered`,
      );
    }
    for (const { pid } of topLevelWindowsProcesses(trusted)) {
      await runWindowsTaskkill(pid, windowsProcessSubtree(trusted, pid));
    }
    await waitForExit(child, 5_000);
  }

  const remaining = await queryWindowsProcessIdentities([...capturedIdentities.keys()]);
  const capturedRemaining = remaining.filter((record) =>
    [...capturedIdentities].some(
      ([pid, createdAt]) =>
        pid === record.pid && Date.parse(createdAt) === Date.parse(record.createdAt),
    ),
  );
  if (capturedRemaining.length > 0) {
    throw new ProcessTreeTerminationError(
      `Windows process tree ${rootPid} still has captured PIDs after taskkill`,
    );
  }
  if (!(await waitForExit(child, 5_000))) {
    throw new ProcessTreeTerminationError(
      `Windows process tree ${rootPid} remained alive after successful taskkill`,
    );
  }
}

async function terminatePosixGroup(
  child: ChildProcess,
  rootPid: number,
  options: ProcessTreeTerminationOptions,
): Promise<void> {
  const graceMs = options.posixGraceMs ?? 2_000;
  if (!Number.isSafeInteger(graceMs) || graceMs < 100 || graceMs > 60_000) {
    throw new ProcessTreeTerminationError(
      "POSIX process-tree grace must be between 100 and 60000ms",
    );
  }
  if (!processGroupExists(rootPid)) {
    if (child.exitCode === null && child.signalCode === null) {
      throw new ProcessTreeTerminationError(
        `POSIX process group ${rootPid} was missing while its root remained alive`,
      );
    }
    return;
  }

  signalPosixProcessGroup(rootPid, "SIGTERM");
  const [childExitedAfterTerm, groupExitedAfterTerm] = await Promise.all([
    waitForExit(child, graceMs),
    waitForProcessGroupExit(rootPid, graceMs),
  ]);
  if (childExitedAfterTerm && groupExitedAfterTerm) return;

  signalPosixProcessGroup(rootPid, "SIGKILL");
  const [childExitedAfterKill, groupExitedAfterKill] = await Promise.all([
    waitForExit(child, 5_000),
    waitForProcessGroupExit(rootPid, 5_000),
  ]);
  if (!childExitedAfterKill || !groupExitedAfterKill) {
    throw new ProcessTreeTerminationError(
      `POSIX process group ${rootPid} did not terminate after SIGKILL`,
    );
  }
}

export async function terminateProcessTree(
  child: ChildProcess,
  initiallyCaptured: readonly WindowsProcessRecord[] = [],
  options: ProcessTreeTerminationOptions = {},
): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) {
    throw new ProcessTreeTerminationError(
      "Cannot discover or terminate a process tree without its root PID",
    );
  }
  if (process.platform === "win32") await terminateWindowsTree(child, pid, initiallyCaptured);
  else await terminatePosixGroup(child, pid, options);
}
