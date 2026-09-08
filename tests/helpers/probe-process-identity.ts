import { readFileSync, readdirSync, readlinkSync, statSync } from "node:fs";

export interface ProbeProcessIdentity {
  readonly pid: number;
  readonly namespace?: string;
  readonly started?: string;
}

function linuxProbeCoordinates(pid: number): { pid: number; started: string } {
  const directory = `/proc/${pid}`;
  const status = readFileSync(`${directory}/status`, "utf8");
  const localPid = Number(
    status
      .match(/^NSpid:\s+([\d\s]+)$/m)?.[1]
      ?.trim()
      .split(/\s+/)
      .at(-1),
  );
  const stat = readFileSync(`${directory}/stat`, "utf8");
  const started = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  if (!Number.isSafeInteger(localPid) || localPid < 1 || !started || !/^\d+$/.test(started)) {
    throw new Error("Could not identify Linux probe process");
  }
  return { pid: localPid, started };
}

/** Linux PIDs are local to a namespace; keep the namespace and kernel birth tick. */
export function captureProbeProcessIdentity(pid = process.pid): ProbeProcessIdentity {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error("Invalid probe process PID");
  if (process.platform !== "linux") return { pid };
  return { ...linuxProbeCoordinates(pid), namespace: readlinkSync(`/proc/${pid}/ns/pid`) };
}

/** Resolve an identity in this observer's PID namespace, never by the recorded PID alone. */
export function findProbeProcess(identity: ProbeProcessIdentity): number | undefined {
  if (process.platform !== "linux") {
    try {
      process.kill(identity.pid, 0);
      return identity.pid;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return undefined;
      throw error;
    }
  }
  if (!identity.namespace || !identity.started) throw new Error("Missing Linux probe identity");
  for (const entry of readdirSync("/proc", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      // A same-user non-dumpable process can deny namespace inspection. First
      // exclude unrelated coordinates; a matching unreadable candidate still fails closed.
      if (statSync(`/proc/${entry.name}`).uid !== process.getuid!()) continue;
      const candidate = linuxProbeCoordinates(Number(entry.name));
      if (candidate.pid !== identity.pid || candidate.started !== identity.started) continue;
      if (readlinkSync(`/proc/${entry.name}/ns/pid`) === identity.namespace) {
        return Number(entry.name);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ESRCH") throw error;
    }
  }
  return undefined;
}

/** Fault injection only: an ancestor namespace may terminate a child namespace's init. */
export function killProbeProcess(identity: ProbeProcessIdentity): void {
  const pid = findProbeProcess(identity);
  if (pid === undefined || pid <= 1 || pid === process.pid) {
    throw new Error("Probe guard was not a safe live descendant");
  }
  const current = captureProbeProcessIdentity(pid);
  if (JSON.stringify(current) !== JSON.stringify(identity)) {
    throw new Error("Probe process identity changed before fault injection");
  }
  process.kill(pid, "SIGKILL");
}
