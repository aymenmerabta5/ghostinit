// @allow-long 700: production launch ownership, bounded artifact scanning, and verified cleanup form one E2E evidence boundary
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { createServer, connect } from "node:net";
import { basename, join, relative } from "node:path";
import { listPosixProcessGroupMembers } from "../../src/lib/posix-process-groups.js";
import { runSupervisedCommand } from "../../src/commands/create/installer.js";
import {
  resolveWindowsSystemExecutable,
  terminateProcessTree as terminateVerifiedProcessTree,
} from "../helpers/process-tree.js";

export interface ArchitectureEnvelope {
  $schema: string;
  schemaVersion: number;
  success: boolean;
  exitCode: number;
  meta?: { command?: unknown; durationMs?: unknown };
  data?: {
    findings?: Array<{ severity?: unknown }>;
    summary?: { blockers?: unknown; highs?: unknown };
  };
}

export interface CommandResult {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
  timedOut: boolean;
}

export interface RunningProcess {
  child: ChildProcess;
  command: string;
  stdout: () => string;
  stderr: () => string;
  output: () => string;
  error: () => Error | undefined;
}

const MAX_CAPTURE_CHARS = 512 * 1024;
const MAX_PUBLIC_ARTIFACT_FILE_BYTES = 128 * 1024 * 1024;
const MAX_PUBLIC_ARTIFACT_BYTES = 512 * 1024 * 1024;
const MAX_PUBLIC_ARTIFACT_FILES = 100_000;
const MAX_PUBLIC_ARTIFACT_DEPTH = 64;
const MAX_HEALTH_CLOCK_SKEW_MS = 60_000;
const activeChildren = new Set<ChildProcess>();
const activeCommands = new Map<AbortController, Promise<CommandResult>>();
let trackedTermination: Promise<void> | undefined;
let unverifiedCommandCleanup: Error | undefined;

export interface HealthPayload {
  readonly status: "ok";
  readonly time: string;
}

export interface HealthyHttpResult {
  readonly payload: HealthPayload;
  readonly response: Response;
}

export interface PublicAssetCanaryScan {
  readonly presentRoots: readonly string[];
  readonly missingRoots: readonly string[];
  readonly leakedFiles: readonly string[];
}

export function packagedDesktopExecutableCandidates(
  desktopRoot: string,
  productName: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (
    !productName ||
    basename(productName) !== productName ||
    productName === "." ||
    productName === ".." ||
    /[\\/]/.test(productName)
  ) {
    throw new Error("A safe desktop product name is required");
  }
  const outputRoot = join(desktopRoot, "out");
  if (platform === "win32") {
    return ["win-unpacked", "win-x64-unpacked", "win-arm64-unpacked", "win-ia32-unpacked"].map(
      (directory) => join(outputRoot, directory, productName + ".exe"),
    );
  }
  if (platform === "linux") {
    return [
      "linux-unpacked",
      "linux-x64-unpacked",
      "linux-arm64-unpacked",
      "linux-armv7l-unpacked",
    ].map((directory) => join(outputRoot, directory, productName));
  }
  if (platform === "darwin") {
    return ["mac", "mac-x64", "mac-arm64", "mac-universal"].map((directory) =>
      join(outputRoot, directory, productName + ".app", "Contents", "MacOS", productName),
    );
  }
  throw new Error("Unsupported Electron launch platform: " + platform);
}

export function resolvePackagedDesktopExecutable(
  desktopRoot: string,
  productName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const candidates = packagedDesktopExecutableCandidates(desktopRoot, productName, platform);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error(
      "Packaged desktop executable was not emitted; checked: " + candidates.join(", "),
    );
  }
  return executable;
}

export interface PackagedDesktopLaunchCommand {
  readonly args: string[];
  readonly command: string;
}

export function packagedDesktopLaunchCommand(
  executable: string,
  userDataDirectory: string,
  platform: NodeJS.Platform = process.platform,
): PackagedDesktopLaunchCommand {
  if (!executable || !userDataDirectory) {
    throw new Error("Packaged desktop launch paths must be non-empty");
  }
  const applicationArgs = [`--user-data-dir=${userDataDirectory}`, "--ghostinit-startup-smoke"];
  // Electron does not support Chromium's --headless mode as a replacement for
  // a Linux display server. CI must run the real packaged executable via Xvfb.
  return platform === "linux"
    ? { command: "xvfb-run", args: ["-a", executable, "--no-sandbox", ...applicationArgs] }
    : { command: executable, args: applicationArgs };
}

/**
 * Scan only deployable public/client artifacts. Server output legitimately
 * contains server-only configuration access and is intentionally out of scope.
 */
export function scanPublicAssetsForCanary(
  projectRoot: string,
  relativeRoots: readonly string[],
  canary: string,
): PublicAssetCanaryScan {
  if (!canary) throw new Error("A non-empty secret canary is required");

  const presentRoots: string[] = [];
  const missingRoots: string[] = [];
  const leakedFiles: string[] = [];
  const needle = Buffer.from(canary, "utf8");
  let scannedBytes = 0;
  let scannedFiles = 0;

  const visit = (path: string, depth = 0): void => {
    if (depth > MAX_PUBLIC_ARTIFACT_DEPTH) {
      throw new Error("Public build artifacts exceed the bounded secret scanner depth");
    }
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `Public build artifact contains an unscannable symbolic link: ${relative(projectRoot, path)}`,
      );
    }
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        visit(join(path, entry.name), depth + 1);
      }
      return;
    }
    if (!metadata.isFile()) {
      throw new Error(
        `Public build artifact contains an unsupported special entry: ${relative(projectRoot, path)}`,
      );
    }
    if (metadata.size > MAX_PUBLIC_ARTIFACT_FILE_BYTES) {
      throw new Error(
        `Public build artifact exceeds the bounded per-file scanner size: ${relative(projectRoot, path)}`,
      );
    }
    scannedFiles += 1;
    if (scannedFiles > MAX_PUBLIC_ARTIFACT_FILES) {
      throw new Error("Public build artifacts exceed the bounded secret scanner file count");
    }
    scannedBytes += metadata.size;
    if (scannedBytes > MAX_PUBLIC_ARTIFACT_BYTES) {
      throw new Error("Public build artifacts exceed the bounded aggregate secret scanner size");
    }
    if (readFileSync(path).includes(needle)) leakedFiles.push(path);
  };

  for (const relativeRoot of relativeRoots) {
    const root = join(projectRoot, relativeRoot);
    if (!existsSync(root)) {
      missingRoots.push(relativeRoot);
      continue;
    }
    presentRoots.push(relativeRoot);
    visit(root);
  }

  return { presentRoots, missingRoots, leakedFiles };
}

export function parseArchitectureEnvelope(output: string): ArchitectureEnvelope {
  try {
    return JSON.parse(output) as ArchitectureEnvelope;
  } catch (error) {
    throw new Error(
      `architecture check did not emit valid JSON: ${error instanceof Error ? error.message : String(error)}\n${output.slice(-4_000)}`,
    );
  }
}

function appendTail(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= MAX_CAPTURE_CHARS
    ? combined
    : combined.slice(combined.length - MAX_CAPTURE_CHARS);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isLoopbackAddress(address: string): boolean {
  if (address === "::1" || address === "[::1]") return true;
  const parts = address.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

interface LinuxListener {
  readonly address: string;
  readonly inode: string;
}

function linuxAddressIsLoopback(address: string): boolean {
  if (/^[0-9A-F]{6}7F$/i.test(address)) return true;
  return (
    address.toUpperCase() === "00000000000000000000000001000000" ||
    address.toUpperCase() === "00000000000000000000000000000001"
  );
}

function linuxListeners(port: number): LinuxListener[] {
  const listeners: LinuxListener[] = [];
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(table)) continue;
    const lines = readFileSync(table, "utf8").trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      const fields = line.trim().split(/\s+/);
      const local = fields[1]?.split(":");
      const candidatePort = Number.parseInt(local?.[1] ?? "", 16);
      if (candidatePort !== port || fields[3] !== "0A") continue;
      const address = local?.[0];
      const inode = fields[9];
      if (!address || !inode || !/^\d+$/.test(inode)) {
        throw new Error(`Linux exposed a malformed listener record for port ${port}`);
      }
      listeners.push({ address, inode });
    }
  }
  return listeners;
}

function linuxListenerOwnedByProcessGroup(rootPid: number, port: number): boolean {
  const listeners = linuxListeners(port);
  if (listeners.length === 0 || listeners.some(({ address }) => !linuxAddressIsLoopback(address))) {
    return false;
  }
  const ownedSockets = new Set<string>();
  for (const pid of listPosixProcessGroupMembers(rootPid)) {
    let descriptors: string[];
    try {
      descriptors = readdirSync(`/proc/${pid}/fd`);
    } catch (error) {
      if (["ENOENT", "ESRCH"].includes(errorCode(error) ?? "")) continue;
      throw error;
    }
    for (const descriptor of descriptors) {
      try {
        const target = readlinkSync(`/proc/${pid}/fd/${descriptor}`);
        const match = /^socket:\[(\d+)\]$/.exec(target);
        if (match?.[1]) ownedSockets.add(match[1]);
      } catch (error) {
        if (["ENOENT", "ESRCH"].includes(errorCode(error) ?? "")) continue;
        throw error;
      }
    }
  }
  return listeners.every(({ inode }) => ownedSockets.has(inode));
}

function windowsListenerOwnedByProcessTree(rootPid: number, port: number): boolean {
  const powershell = resolveWindowsSystemExecutable("powershell");
  const script = `$ErrorActionPreference = "Stop"
$rootPid = ${rootPid}
$connections = @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop)
$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
$parents = @{}
foreach ($process in $processes) { $parents[[int]$process.ProcessId] = [int]$process.ParentProcessId }
$result = @($connections | ForEach-Object {
  $ownerPid = [int]$_.OwningProcess
  $cursor = $ownerPid
  $owned = $false
  $seen = @{}
  while ($cursor -gt 0 -and -not $seen.ContainsKey([string]$cursor)) {
    $seen[[string]$cursor] = $true
    if ($cursor -eq $rootPid) { $owned = $true; break }
    if (-not $parents.ContainsKey($cursor)) { break }
    $cursor = [int]$parents[$cursor]
  }
  [pscustomobject]@{ address = [string]$_.LocalAddress; ownerPid = $ownerPid; owned = $owned }
})
ConvertTo-Json -InputObject @($result) -Compress`;
  const result = spawnSync(
    powershell,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      env: { ...process.env, POWERSHELL_TELEMETRY_OPTOUT: "1" },
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error(
      `Could not verify the Windows production listener: ${result.error?.message ?? result.stderr.trim() ?? String(result.status)}`,
    );
  }
  const parsed = JSON.parse(result.stdout || "[]") as unknown;
  if (!Array.isArray(parsed)) throw new Error("Windows listener discovery returned invalid JSON");
  return (
    parsed.length > 0 &&
    parsed.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "address" in entry &&
        typeof entry.address === "string" &&
        isLoopbackAddress(entry.address) &&
        "owned" in entry &&
        entry.owned === true,
    )
  );
}

function lsofListenerOwnedByProcessGroup(rootPid: number, port: number): boolean {
  // Listener evidence must come from the OS utility, even when a generated
  // project's working directory or PATH contains an executable named lsof.
  const lsof = "/usr/sbin/lsof";
  try {
    const metadata = lstatSync(lsof);
    if (!metadata.isFile() || metadata.isSymbolicLink() || realpathSync(lsof) !== lsof) {
      throw new Error("not a canonical regular executable");
    }
  } catch (error) {
    throw new Error(
      `System lsof is missing or unsafe: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const result = spawnSync(lsof, ["-nP", "-a", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpn"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    timeout: 10_000,
  });
  if (result.error || result.signal !== null || ![0, 1].includes(result.status ?? -1)) {
    throw new Error(
      `Could not verify the production listener with lsof: ${result.error?.message ?? result.stderr.trim() ?? String(result.status)}`,
    );
  }
  if (result.status === 1) return false;
  const listeners: Array<{ address: string; pid: number }> = [];
  let pid: number | undefined;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) pid = Number.parseInt(line.slice(1), 10);
    else if (line.startsWith("n") && pid !== undefined) {
      listeners.push({ address: line.slice(1), pid });
    }
  }
  const processGroup = new Set(listPosixProcessGroupMembers(rootPid));
  return (
    listeners.length > 0 &&
    listeners.every(({ address, pid: listenerPid }) => {
      const host = address.endsWith(`:${port}`) ? address.slice(0, -String(port).length - 1) : "";
      return isLoopbackAddress(host) && processGroup.has(listenerPid);
    })
  );
}

/** Proves the loopback listener belongs to the spawned command's live process tree/group. */
export function productionListenerOwnedByProcessTree(child: ChildProcess, port: number): boolean {
  const pid = child.pid;
  if (
    !Number.isSafeInteger(pid) ||
    (pid ?? 0) <= 1 ||
    !Number.isSafeInteger(port) ||
    port <= 0 ||
    port > 65_535
  ) {
    throw new Error("A safe process and TCP port are required for listener ownership verification");
  }
  if (process.platform === "win32") return windowsListenerOwnedByProcessTree(pid!, port);
  if (process.platform === "linux") return linuxListenerOwnedByProcessGroup(pid!, port);
  return lsofListenerOwnedByProcessGroup(pid!, port);
}

export async function assertLoopbackPortUnowned(port: number): Promise<void> {
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("A safe loopback TCP port is required");
  }
  await new Promise<void>((resolveProbe, rejectProbe) => {
    const socket = connect({ host: "127.0.0.1", port });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) rejectProbe(error);
      else resolveProbe();
    };
    const timer = setTimeout(
      () => finish(new Error(`Timed out while checking loopback port ${port}`)),
      2_000,
    );
    socket.once("connect", () => finish(new Error(`Loopback port ${port} is already owned`)));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED") finish();
      else
        finish(new Error(`Could not verify loopback port ${port}: ${error.code ?? error.message}`));
    });
  });
}

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  await terminateVerifiedProcessTree(child);
  activeChildren.delete(child);
}

export function spawnTracked(
  cmd: string,
  args: string[],
  cwdDirectory: string,
  environment: NodeJS.ProcessEnv = process.env,
): RunningProcess {
  let stdout = "";
  let stderr = "";
  let spawnError: Error | undefined;
  const child = spawn(cmd, args, {
    cwd: cwdDirectory,
    detached: process.platform !== "win32",
    env: environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  activeChildren.add(child);
  child.stdout?.on("data", (chunk) => {
    stdout = appendTail(stdout, String(chunk));
  });
  child.stderr?.on("data", (chunk) => {
    stderr = appendTail(stderr, String(chunk));
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  child.once("close", () => activeChildren.delete(child));
  return {
    child,
    command: [cmd, ...args].join(" "),
    stdout: () => stdout,
    stderr: () => stderr,
    output: () => `${stdout}\n${stderr}`,
    error: () => spawnError,
  };
}

export function runCommand(
  cmd: string,
  args: string[],
  cwdDirectory: string,
  timeoutMs = 300_000,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  let stdout = "";
  let stderr = "";
  const controller = new AbortController();
  if (trackedTermination || unverifiedCommandCleanup) controller.abort("SIGTERM");
  const command = [cmd, ...args].join(" ");
  const completion = runSupervisedCommand({
    command: cmd,
    argv: args,
    cwd: cwdDirectory,
    label: "E2E command",
    timeoutMs,
    env: environment,
    abortSignal: controller.signal,
    signalSource: new EventEmitter(),
    onStdout: (chunk) => {
      stdout = appendTail(stdout, String(chunk));
    },
    onStderr: (chunk) => {
      stderr = appendTail(stderr, String(chunk));
    },
  })
    .catch((error: unknown) => ({
      exitCode: null,
      signal: null,
      timedOut: false,
      cleanupVerified: false,
      error: error instanceof Error ? error : new Error(String(error)),
    }))
    .then((result): CommandResult => {
      // A normal command failure remains an exit-code result. Spawn/admission
      // and cleanup failures use the existing error field and block acceptance.
      const error = !result.cleanupVerified
        ? (result.error ?? new Error("E2E command process-tree cleanup could not be verified"))
        : result.exitCode === null && result.signal === null && !result.timedOut
          ? result.error
          : undefined;
      if (!result.cleanupVerified) unverifiedCommandCleanup ??= error;
      return {
        command,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout,
        stderr,
        ...(error ? { error } : {}),
        timedOut: result.timedOut,
      };
    })
    .finally(() => {
      activeCommands.delete(controller);
    });
  activeCommands.set(controller, completion);
  return completion;
}

export function terminateTrackedProcesses(): Promise<void> {
  if (trackedTermination) return trackedTermination;
  const commands = [...activeCommands].map(([controller, completion]) => {
    controller.abort("SIGTERM");
    return completion;
  });
  trackedTermination = Promise.allSettled([
    ...commands,
    ...[...activeChildren].map((child) => terminateProcessTree(child)),
  ])
    .then((results) => {
      // Retain uncertainty after a one-shot result leaves activeCommands. The
      // E2E afterEach must throw before deleting the candidate workspace.
      if (unverifiedCommandCleanup) throw unverifiedCommandCleanup;
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failure) throw failure.reason;
    })
    .finally(() => {
      trackedTermination = undefined;
    });
  return trackedTermination;
}

export async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a TCP port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

export function isExactHealthPayload(value: unknown, now = Date.now()): value is HealthPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "status,time") return false;
  if (record.status !== "ok" || typeof record.time !== "string") return false;
  const parsed = Date.parse(record.time);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === record.time &&
    Math.abs(now - parsed) <= MAX_HEALTH_CLOCK_SKEW_MS
  );
}

async function readHealthyResponse(response: Response): Promise<HealthPayload | undefined> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (response.status !== 200 || contentType !== "application/json") {
    await response.body?.cancel();
    return undefined;
  }
  try {
    const payload: unknown = JSON.parse(await response.text());
    return isExactHealthPayload(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

export async function waitForHealthyHttp(
  running: RunningProcess,
  url: string,
  timeoutMs: number,
): Promise<HealthyHttpResult> {
  const parsedUrl = new URL(url);
  const port = Number.parseInt(parsedUrl.port, 10);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Health URL must contain an explicit safe port: ${url}`);
  }
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response";
  while (Date.now() < deadline) {
    const spawnError = running.error();
    if (spawnError) throw new Error(`production server failed to start: ${spawnError.message}`);
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      throw new Error(
        `production server exited before readiness:\n${running.output().slice(-8_000)}`,
      );
    }
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      const payload = await readHealthyResponse(response);
      const listenerOwned =
        payload !== undefined && productionListenerOwnedByProcessTree(running.child, port);
      if (payload && listenerOwned) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (running.child.exitCode !== null || running.child.signalCode !== null) {
          throw new Error("production server exited immediately after its health response");
        }
        return { payload, response };
      }
      lastFailure = payload
        ? `HTTP 200 health response came from a listener outside the spawned process tree`
        : `HTTP ${response.status} did not match the exact health contract`;
    } catch (error) {
      // Cold production starts can take several seconds after the process spawns.
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `production server did not become healthy (${lastFailure}):\n${running.output().slice(-8_000)}`,
  );
}

export function rawWebSocketUpgradeStatus(
  port: number,
  path: string,
  origin: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    let response = "";
    let settled = false;
    const finish = (status?: number, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else if (status !== undefined) resolve(status);
    };
    const timer = setTimeout(
      () => finish(undefined, new Error(`Timed out waiting for upgrade response from ${path}`)),
      10_000,
    );
    socket.once("error", (error) => finish(undefined, error));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (!response.includes("\r\n\r\n")) return;
      const match = /^HTTP\/1\.[01] (\d{3})/.exec(response);
      if (!match) {
        finish(undefined, new Error(`Invalid upgrade response: ${response.slice(0, 1_000)}`));
        return;
      }
      finish(Number.parseInt(match[1] ?? "", 10));
    });
    socket.once("connect", () => {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          `Origin: ${origin}`,
          `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
          "Sec-WebSocket-Version: 13",
          ...Object.entries(extraHeaders).map(([name, value]) => `${name}: ${value}`),
          "",
          "",
        ].join("\r\n"),
      );
    });
  });
}
