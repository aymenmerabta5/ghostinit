import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

export class PosixProcessGroupError extends Error {
  readonly code: string | undefined;

  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "PosixProcessGroupError";
    this.code = errnoCode(cause);
  }
}

type SignalProcessGroup = (target: number, signal: NodeJS.Signals) => unknown;

export interface PosixProcessGroupDependencies {
  readonly platform: NodeJS.Platform;
  readonly linuxProcessStats: () => readonly string[];
  readonly psProcessTable: () => string;
  readonly signal: SignalProcessGroup;
}

function errnoCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function readLinuxProcessStats(): readonly string[] {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = readdirSync("/proc", { withFileTypes: true });
  } catch (error) {
    throw new PosixProcessGroupError("Could not enumerate the Linux process table", error);
  }

  const stats: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      stats.push(readFileSync(`/proc/${entry.name}/stat`, "utf8"));
    } catch (error) {
      const code = errnoCode(error);
      if (code === "ENOENT" || code === "ESRCH") continue;
      throw new PosixProcessGroupError(
        `Could not inspect Linux process ${entry.name} while verifying a process group`,
        error,
      );
    }
  }
  return stats;
}

function readPsProcessTable(): string {
  const executable = existsSync("/bin/ps")
    ? "/bin/ps"
    : existsSync("/usr/bin/ps")
      ? "/usr/bin/ps"
      : undefined;
  if (executable === undefined) {
    throw new PosixProcessGroupError("Could not locate a POSIX ps executable");
  }
  const result = spawnSync(executable, ["-A", "-o", "pid=", "-o", "pgid="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new PosixProcessGroupError(
      `Could not inspect the POSIX process table: ${result.error?.message ?? (result.stderr.trim() || String(result.status))}`,
      result.error,
    );
  }
  return result.stdout;
}

const defaultDependencies: PosixProcessGroupDependencies = {
  platform: process.platform,
  linuxProcessStats: readLinuxProcessStats,
  psProcessTable: readPsProcessTable,
  signal: (target, signal) => process.kill(target, signal),
};

function assertSafeProcessGroupId(groupId: number): void {
  if (!Number.isSafeInteger(groupId) || groupId <= 1) {
    throw new PosixProcessGroupError(`Refusing unsafe POSIX process group id ${String(groupId)}`);
  }
}

function linuxStatIdentity(stat: string): { readonly pid: number; readonly groupId: number } {
  const open = stat.indexOf(" (");
  const close = stat.lastIndexOf(")");
  const fields =
    close >= 0
      ? stat
          .slice(close + 1)
          .trim()
          .split(/\s+/)
      : [];
  const pid = Number.parseInt(open >= 0 ? stat.slice(0, open) : "", 10);
  const groupId = Number.parseInt(fields[2] ?? "", 10);
  if (
    open <= 0 ||
    close <= open ||
    fields.length < 3 ||
    !Number.isSafeInteger(pid) ||
    pid <= 0 ||
    !Number.isSafeInteger(groupId) ||
    groupId < 0
  ) {
    throw new PosixProcessGroupError("Linux exposed a malformed /proc process stat record");
  }
  return { pid, groupId };
}

function linuxProcessGroupMembers(stats: readonly string[], groupId: number): number[] {
  return stats
    .map(linuxStatIdentity)
    .filter((identity) => identity.groupId === groupId)
    .map((identity) => identity.pid);
}

function psProcessGroupMembers(table: string, groupId: number): number[] {
  const members: number[] = [];
  for (const line of table.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 2 || !fields.every((field) => /^\d+$/.test(field))) {
      throw new PosixProcessGroupError("ps exposed a malformed PID/process-group record");
    }
    const pid = Number.parseInt(fields[0] ?? "", 10);
    const candidateGroupId = Number.parseInt(fields[1] ?? "", 10);
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(candidateGroupId)) {
      throw new PosixProcessGroupError("ps exposed an unsafe PID/process-group record");
    }
    if (candidateGroupId === groupId) members.push(pid);
  }
  return members;
}

/**
 * List process-group membership without using `kill(-pgid, 0)`. Bun 1.4 on
 * macOS can surface EPERM from that signal-0 probe after an otherwise
 * successful group signal, which is not evidence that the group is absent.
 */
export function listPosixProcessGroupMembers(
  groupId: number,
  overrides: Partial<PosixProcessGroupDependencies> = {},
): readonly number[] {
  assertSafeProcessGroupId(groupId);
  const dependencies = { ...defaultDependencies, ...overrides };
  if (dependencies.platform === "win32") {
    throw new PosixProcessGroupError("POSIX process groups are unavailable on Windows");
  }
  try {
    const members =
      dependencies.platform === "linux"
        ? linuxProcessGroupMembers(dependencies.linuxProcessStats(), groupId)
        : psProcessGroupMembers(dependencies.psProcessTable(), groupId);
    return [...new Set(members)].sort((left, right) => left - right);
  } catch (error) {
    if (error instanceof PosixProcessGroupError) throw error;
    throw new PosixProcessGroupError(
      `Could not verify POSIX process group ${groupId}: ${describeError(error)}`,
      error,
    );
  }
}

/**
 * Send one atomic group signal. ESRCH is a permissible disappearance race and
 * must be followed by process-table verification. Every other error, including
 * EPERM, is a cleanup failure.
 */
export function sendPosixProcessGroupSignal(
  groupId: number,
  signal: NodeJS.Signals,
  overrides: Partial<PosixProcessGroupDependencies> = {},
): "signaled" | "missing" {
  assertSafeProcessGroupId(groupId);
  const dependencies = { ...defaultDependencies, ...overrides };
  try {
    dependencies.signal(-groupId, signal);
    return "signaled";
  } catch (error) {
    if (errnoCode(error) === "ESRCH") return "missing";
    const code = errnoCode(error);
    throw new PosixProcessGroupError(
      `POSIX process group ${groupId} could not receive ${signal}${code ? ` (${code})` : ""}: ${describeError(error)}`,
      error,
    );
  }
}
