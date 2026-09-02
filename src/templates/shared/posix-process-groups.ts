export interface PosixProcessGroupHelpersOptions {
  readonly label: string;
  readonly inspectionTimeoutExpression: string;
}

/** Emit the identical fail-closed POSIX group protocol for generated supervisors. */
export function posixProcessGroupHelpersContent({
  label,
  inspectionTimeoutExpression,
}: PosixProcessGroupHelpersOptions): string {
  return `const POSIX_PROCESS_GROUP_LABEL = ${JSON.stringify(label)};

function errnoCode(error) {
  return error && typeof error === "object" && typeof error.code === "string" ? error.code : null;
}

function linuxProcessGroupIds(groupPid) {
  let entries;
  try {
    entries = readdirSync("/proc", { withFileTypes: true });
  } catch (error) {
    throw new Error("Could not enumerate the Linux " + POSIX_PROCESS_GROUP_LABEL + " process table", {
      cause: error,
    });
  }
  const members = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\\d+$/.test(entry.name)) continue;
    let stat;
    try {
      stat = readFileSync("/proc/" + entry.name + "/stat", "utf8");
    } catch (error) {
      const code = errnoCode(error);
      if (code === "ENOENT" || code === "ESRCH") continue;
      throw new Error(
        "Could not inspect Linux process " + entry.name + " while verifying the " +
          POSIX_PROCESS_GROUP_LABEL + " process group" + (code ? " (" + code + ")" : ""),
        { cause: error },
      );
    }
    const close = stat.lastIndexOf(")");
    const fields = close >= 0 ? stat.slice(close + 1).trim().split(/\\s+/) : [];
    const pid = Number.parseInt(entry.name, 10);
    const candidateGroup = Number.parseInt(fields[2] || "", 10);
    if (
      close < 0 || fields.length < 3 || !Number.isSafeInteger(pid) || pid <= 0 ||
      !Number.isSafeInteger(candidateGroup) || candidateGroup <= 0
    ) {
      throw new Error("Linux exposed a malformed /proc process stat record");
    }
    if (candidateGroup === groupPid) members.push(pid);
  }
  return members;
}

function macProcessGroupIds(groupPid) {
  const result = spawnSync("/bin/ps", ["-A", "-o", "pid=", "-o", "pgid="], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: ${inspectionTimeoutExpression},
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error(
      "Could not inspect the macOS " + POSIX_PROCESS_GROUP_LABEL + " process table: " +
        (result.error?.message || String(result.stderr || result.status)),
      { cause: result.error },
    );
  }
  const members = [];
  for (const line of result.stdout.split("\\n")) {
    if (!line.trim()) continue;
    const fields = line.trim().split(/\\s+/);
    if (fields.length !== 2 || !fields.every((field) => /^\\d+$/.test(field))) {
      throw new Error("ps exposed a malformed PID/process-group record");
    }
    const pid = Number.parseInt(fields[0], 10);
    const candidateGroup = Number.parseInt(fields[1], 10);
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(candidateGroup)) {
      throw new Error("ps exposed an unsafe PID/process-group record");
    }
    if (candidateGroup === groupPid) members.push(pid);
  }
  return members;
}

function processGroupIds(groupPid) {
  if (!Number.isSafeInteger(groupPid) || groupPid <= 1) {
    throw new Error("Refusing unsafe POSIX process group id " + String(groupPid));
  }
  if (process.platform === "linux") return linuxProcessGroupIds(groupPid);
  if (process.platform === "darwin") return macProcessGroupIds(groupPid);
  throw new Error(POSIX_PROCESS_GROUP_LABEL + " process groups require Linux or macOS");
}

function processGroupExists(groupPid) {
  return processGroupIds(groupPid).length > 0;
}

function signalProcessGroup(groupPid, signal) {
  try {
    process.kill(-groupPid, signal);
    return true;
  } catch (error) {
    if (errnoCode(error) === "ESRCH") return false;
    const code = errnoCode(error);
    throw new Error(
      POSIX_PROCESS_GROUP_LABEL + " process group " + groupPid + " could not receive " + signal +
        (code ? " (" + code + ")" : "") + ": " +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
}
`;
}
