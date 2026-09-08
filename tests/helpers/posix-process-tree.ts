import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

export interface PosixProcessIdentity {
  readonly pid: number;
  readonly parentPid: number;
  readonly started: string;
}

function disappeared(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ESRCH";
}

function linuxProcess(pid: number): PosixProcessIdentity | undefined {
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch (error) {
    if (disappeared(error)) return undefined;
    throw error;
  }
  const fields = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  if (fields[0] === "Z" || fields[0] === "X") return undefined;
  const parentPid = Number(fields[1]);
  const started = fields[19];
  if (!Number.isSafeInteger(parentPid) || parentPid < 0 || !started || !/^\d+$/.test(started)) {
    throw new Error("Linux returned an invalid process identity");
  }
  return { pid, parentPid, started };
}

function processTable(): PosixProcessIdentity[] {
  if (process.platform === "linux") {
    const records: PosixProcessIdentity[] = [];
    for (const entry of readdirSync("/proc", { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const record = linuxProcess(Number(entry.name));
      if (record) records.push(record);
    }
    return records;
  }
  const result = spawnSync("/bin/ps", ["-A", "-o", "pid=", "-o", "ppid=", "-o", "lstart="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error("Could not inspect the POSIX process tree");
  }
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      const pid = Number(match?.[1]);
      const parentPid = Number(match?.[2]);
      const started = Date.parse(match?.[3] ?? "");
      if (pid === 0) return [];
      if (
        !Number.isSafeInteger(pid) ||
        pid < 1 ||
        !Number.isSafeInteger(parentPid) ||
        parentPid < 0 ||
        !Number.isFinite(started)
      ) {
        throw new Error("POSIX process table contained an invalid identity");
      }
      return [{ pid, parentPid, started: String(started) }];
    });
}

function sameProcess(left: PosixProcessIdentity, right: PosixProcessIdentity): boolean {
  return (
    left.pid === right.pid && left.parentPid === right.parentPid && left.started === right.started
  );
}

export function capturePosixProcessIdentity(pid: number): PosixProcessIdentity {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    throw new Error("A safe POSIX process PID is required");
  const record =
    process.platform === "linux"
      ? linuxProcess(pid)
      : processTable().find((entry) => entry.pid === pid);
  if (!record) throw new Error("The spawned POSIX process is no longer live");
  return record;
}

export function snapshotPosixProcessTree(root: PosixProcessIdentity): PosixProcessIdentity[] {
  const table = processTable();
  const currentRoot = table.find(({ pid }) => pid === root.pid);
  if (!currentRoot || !sameProcess(root, currentRoot)) return [];
  const owned = new Map([[root.pid, root]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of table) {
      const parent = owned.get(record.parentPid);
      if (owned.has(record.pid) || !parent || BigInt(record.started) < BigInt(parent.started))
        continue;
      owned.set(record.pid, record);
      changed = true;
    }
  }
  return [...owned.values()];
}

export function posixProcessTreeStillMatches(records: readonly PosixProcessIdentity[]): boolean {
  if (records.length === 0) return false;
  const current = new Map(processTable().map((record) => [record.pid, record]));
  return records.every((record) => {
    const candidate = current.get(record.pid);
    return candidate !== undefined && sameProcess(record, candidate);
  });
}
