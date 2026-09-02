import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, connect } from "node:net";
import { basename, join } from "node:path";

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
const TERMINATION_GRACE_MS = 5_000;
const activeChildren = new Set<ChildProcess>();

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

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (entry.isFile() && readFileSync(path).includes(needle)) leakedFiles.push(path);
    }
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

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) return;

  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") {
      const terminated = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: TERMINATION_GRACE_MS,
      });
      if (
        (terminated.error || terminated.status !== 0) &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        child.kill("SIGKILL");
      }
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      }
      if (!(await waitForExit(child, TERMINATION_GRACE_MS))) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }
      }
    }
  }

  const exited = await waitForExit(child, TERMINATION_GRACE_MS);
  if (!exited) throw new Error(`Failed to terminate process tree ${pid}`);
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
  const running = spawnTracked(cmd, args, cwdDirectory, environment);
  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const error = running.error();
      resolve({
        command: running.command,
        exitCode,
        signal,
        stdout: running.stdout(),
        stderr: running.stderr(),
        ...(error ? { error } : {}),
        timedOut,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(running.child).finally(() =>
        finish(running.child.exitCode, running.child.signalCode),
      );
    }, timeoutMs);
    running.child.once("close", finish);
  });
}

export async function terminateTrackedProcesses(): Promise<void> {
  const results = await Promise.allSettled(
    [...activeChildren].map((child) => terminateProcessTree(child)),
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
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

export async function waitForHealthyHttp(
  running: RunningProcess,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (running.child.exitCode !== null || running.child.signalCode !== null) {
      throw new Error(
        `production server exited before readiness:\n${running.output().slice(-8_000)}`,
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return response;
    } catch {
      // Cold production starts can take several seconds after the process spawns.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`production server did not become healthy:\n${running.output().slice(-8_000)}`);
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
