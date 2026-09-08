// Shared source is embedded in both generated wrappers so their cleanup contract cannot drift.
export function cloudflareProcessHelpers(includeRecoveryMarker = false): string {
  const recoveryMarker = includeRecoveryMarker
    ? String.raw`
function createProcessRecoveryMarker(root, child) {
  const path = resolve(root, PROCESS_RECOVERY_PREFIX + process.pid + "-" + randomUUID());
  const content = JSON.stringify({ version: 1, pid: process.pid, owner: randomUUID(), child: childProcessIdentity(child) }) + "\n";
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  const created = lstatSync(path);
  return () => {
    const current = lstatSync(path);
    if (!current.isFile() || current.isSymbolicLink() || current.size > 4096 ||
      ["dev", "ino", "birthtimeMs"].some((field) => current[field] !== created[field]) || readFileSync(path, "utf8") !== content) {
      throw new Error("Child recovery marker ownership changed; leaving it untouched");
    }
    unlinkSync(path);
  };
}
`
    : "";
  return String.raw`
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const childHasExited = (child) => child.exitCode !== null || child.signalCode !== null;
const PROCESS_RECOVERY_PREFIX = ".dev.vars.ghostinit-process-recovery-";

function remainingProcessBudget(deadline, maximum = 30_000) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Process-tree termination exceeded its bounded deadline");
  return Math.max(1, Math.min(maximum, remaining));
}

async function withinProcessDeadline(operation, deadline, onTimeout) {
  let timer;
  try {
    const result = await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => {
        let cause;
        try { onTimeout?.(); } catch (error) { cause = error; }
        reject(new Error("Process-tree termination exceeded its bounded deadline", { cause }));
      }, remainingProcessBudget(deadline));
    })]);
    remainingProcessBudget(deadline);
    return result;
  } finally { clearTimeout(timer); }
}

function assertNoProcessRecovery(root) {
  for (const name of readdirSync(root)) {
    const normalized = name.toLowerCase();
    if (normalized.startsWith(PROCESS_RECOVERY_PREFIX)) {
      throw new Error("Unverified child cleanup marker exists; verify the recorded wrapper, child PID, and process group/tree stopped before removing .dev.vars.ghostinit-process-recovery-* and retrying");
    }
    if (!normalized.startsWith(".dev.vars.ghostinit-convex-")) continue;
    const match = /^\.dev\.vars\.ghostinit-convex-(\d+)-[0-9a-f-]{36}$/.exec(normalized);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 1) {
      throw new Error("Unsafe Convex temporary environment filename; inspect it before retrying");
    }
    try { process.kill(Number(match[1]), 0); } catch {
      throw new Error("A stale Convex temporary environment remains; verify its wrapper and child process tree stopped before removing .dev.vars.ghostinit-convex-* and retrying");
    }
  }
}

function childProcessIdentity(child) {
  return { pid: child.pid, processGroup: process.platform === "win32" ? null : child.pid,
    createdAt: child.ghostinitProcessTree?.records.find((entry) => entry.pid === child.pid)?.createdAt ?? null };
}

${recoveryMarker}

async function waitForCondition(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (predicate()) return true;
    await sleep(50);
  } while (Date.now() < deadline);
  return predicate();
}

function windowsSystemExecutable(name) {
  const configuredRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? process.env.WINDIR;
  if (!configuredRoot || !isAbsolute(configuredRoot)) throw new Error("Windows system root is missing or unsafe");
  const system32 = realpathSync(resolve(realpathSync(configuredRoot), "System32"));
  const unresolved = name === "taskkill"
    ? resolve(system32, "taskkill.exe")
    : resolve(system32, "WindowsPowerShell", "v1.0", "powershell.exe");
  const metadata = lstatSync(unresolved);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Windows cleanup executable is not a regular system file");
  const executable = realpathSync(unresolved);
  const descendant = relative(system32, executable);
  if (!descendant || descendant === ".." || descendant.startsWith(".." + sep) || isAbsolute(descendant)) {
    throw new Error("Windows cleanup executable escapes canonical System32");
  }
  return executable;
}

let windowsInspectionTail = Promise.resolve();
function windowsProcessTable(deadline = Date.now() + 10_000) {
  let cancelled = false;
  let stopQuery;
  const inspection = windowsInspectionTail.then(() => {
    if (cancelled) throw new Error("Process-tree termination exceeded its bounded deadline");
    return readWindowsProcessTable(deadline, (stop) => { stopQuery = stop; });
  });
  windowsInspectionTail = inspection.then(() => undefined, () => undefined);
  return withinProcessDeadline(inspection, deadline, () => { cancelled = true; stopQuery?.(); });
}

async function readWindowsProcessTable(deadline, registerStop) {
  const script = '$ErrorActionPreference = "Stop"\n' +
    '$records = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | Where-Object { $_.ProcessId -gt 0 } | ForEach-Object {\n' +
    '  [pscustomobject]@{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; createdAt = ([datetime]$_.CreationDate).ToUniversalTime().ToString("O") }\n' +
    '})\nConvertTo-Json -InputObject @($records) -Compress';
  const startedAt = Date.now();
  const query = spawn(windowsSystemExecutable("powershell"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    shell: false, windowsHide: true, timeout: remainingProcessBudget(deadline, 10_000), killSignal: "SIGKILL",
    stdio: ["ignore", "pipe", "pipe"],
  });
  registerStop(() => query.kill("SIGKILL"));
  const chunks = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let exceeded = false;
  let spawnError;
  const receive = (chunk, stdout) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (stdout) stdoutBytes += bytes.length;
    else stderrBytes += bytes.length;
    if (stdoutBytes + stderrBytes > 16 * 1024 * 1024) {
      if (!exceeded) { exceeded = true; query.kill("SIGKILL"); }
      return;
    }
    if (stdout) chunks.push(bytes);
  };
  query.stdout.on("data", (chunk) => receive(chunk, true));
  query.stderr.on("data", (chunk) => receive(chunk, false));
  query.once("error", (error) => { spawnError = error; });
  // Joining close also drains both pipes; do not leave an inspection process holding the workspace.
  const result = await new Promise((resolveResult) => {
    query.once("close", (status, signal) => resolveResult({ status, signal }));
  });
  remainingProcessBudget(deadline);
  const diagnostic = { phase: "windows-process-table", pid: query.pid ?? null, status: result.status, signal: result.signal,
    code: spawnError?.code ?? null, elapsedMs: Date.now() - startedAt, stdoutBytes, stderrBytes, exceeded };
  if (spawnError || result.status !== 0 || result.signal !== null || exceeded) {
    throw new Error("Could not verify the Windows process table: " + JSON.stringify(diagnostic));
  }
  let records;
  try { records = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Windows process table was not valid JSON: " + JSON.stringify(diagnostic)); }
  if (!Array.isArray(records) || records.some((record) => !Number.isSafeInteger(record.pid) || record.pid < 0 ||
    !Number.isSafeInteger(record.parentPid) || record.parentPid < 0 || !Number.isFinite(Date.parse(record.createdAt)))) {
    throw new Error("Windows process table contained an invalid identity");
  }
  return records;
}

async function captureProcessTree(child, deadline = Date.now() + 10_000) {
  const pid = child.pid;
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Cannot supervise a child without a safe root PID");
  const state = child.ghostinitProcessTree ??= { pid, groupId: process.platform === "win32" ? null : pid, records: [] };
  if (process.platform !== "win32") return state;
  if (state.unverified) throw new Error("Unverified Windows descendant evidence prevents cleanup certification");
  const table = await windowsProcessTable(deadline);
  remainingProcessBudget(deadline);
  if (state.unverified) throw new Error("Unverified Windows descendant evidence prevents cleanup certification");
  const known = new Map(state.records.map((record) => [record.pid, record]));
  const trusted = new Map(table.filter((record) => known.get(record.pid)?.createdAt === record.createdAt).map((record) => [record.pid, record]));
  const root = table.find((record) => record.pid === pid);
  if (root && !childHasExited(child) && (!known.has(pid) || known.get(pid).createdAt === root.createdAt)) trusted.set(pid, root);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of table) {
      const parent = trusted.get(record.parentPid);
      if (trusted.has(record.pid) || !parent || Date.parse(record.createdAt) < Date.parse(parent.createdAt)) continue;
      trusted.set(record.pid, record);
      changed = true;
    }
  }
  for (const record of trusted.values()) known.set(record.pid, record);
  state.records = [...known.values()];
  const unresolved = table.filter((record) => !trusted.has(record.pid) && known.has(record.parentPid) &&
    Date.parse(record.createdAt) >= Date.parse(known.get(record.parentPid).createdAt));
  if (unresolved.length > 0) {
    state.unverified = true;
    state.unverifiedRecords = unresolved.slice(0, 16);
    throw new Error("Unverified descendants remain after a captured Windows parent exited");
  }
  // A root that exited before its identity could be captured cannot authorize
  // killing a PID-only orphan. Preserve the lock for explicit operator recovery.
  if (state.records.length === 0 && childHasExited(child) && table.some((record) => record.parentPid === pid)) {
    state.unverified = true;
    state.unverifiedRecords = table.filter((record) => record.parentPid === pid).slice(0, 16);
    throw new Error("Exited Windows child has unverified descendants");
  }
  state.live = [...trusted.values()];
  return state;
}

function posixProcessGroupExists(pid, deadline = Date.now() + 5_000) {
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Unsafe POSIX process group");
  // Inspect the process table: Bun on macOS can return EPERM for kill(-pgid, 0)
  // even after the group has exited. Zombies cannot execute or read env files.
  const ps = existsSync("/bin/ps") ? "/bin/ps" : "/usr/bin/ps";
  const result = spawnSync(ps, ["-A", "-o", "pid=", "-o", "pgid=", "-o", "stat="], {
    encoding: "utf8", shell: false, timeout: remainingProcessBudget(deadline, 5_000), maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"],
  });
  remainingProcessBudget(deadline);
  if (result.error || result.status !== 0 || result.signal !== null) throw new Error("Could not verify the POSIX process table");
  let live = false;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Darwin emits '?' when task inspection is unavailable; it is live, never proof of exit.
    const match = /^\s*(\d+)\s+(\d+)\s+([A-Za-z?+<>NslLWX-]+)\s*$/.exec(line);
    if (!match) throw new Error("POSIX process table contained an invalid identity");
    if (Number(match[2]) === pid && !match[3].startsWith("Z")) live = true;
  }
  return live;
}

async function terminateSupervisedProcessTree(child, completion, signal = "SIGTERM") {
  const pid = child.pid;
  if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("Cannot terminate a child without a safe root PID");
  const deadline = Date.now() + 30_000;
  const assertWithinDeadline = () => remainingProcessBudget(deadline);
  if (process.platform === "win32") {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assertWithinDeadline();
      const state = await captureProcessTree(child, deadline);
      assertWithinDeadline();
      if (state.live.length === 0) {
        if (!(await withinProcessDeadline(waitForCondition(() => childHasExited(child), remainingProcessBudget(deadline, 5_000)), deadline))) throw new Error("Windows child remained live without a verifiable identity");
        assertWithinDeadline();
        await withinProcessDeadline(Promise.resolve(completion).catch(() => undefined), deadline);
        assertWithinDeadline();
        if (state.unverified) throw new Error("Unverified Windows descendant evidence prevents cleanup certification");
        return;
      }
      const ids = new Set(state.live.map((record) => record.pid));
      for (const root of state.live.filter((record) => !ids.has(record.parentPid))) {
        assertWithinDeadline();
        const outcome = spawnSync(windowsSystemExecutable("taskkill"), ["/PID", String(root.pid), "/T", "/F"], {
          encoding: "utf8", shell: false, timeout: remainingProcessBudget(deadline, 10_000), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        });
        if (outcome.error || outcome.signal !== null || outcome.status === null) throw new Error("Windows process-tree termination failed");
        assertWithinDeadline();
        const current = await windowsProcessTable(deadline);
        assertWithinDeadline();
        const remaining = state.live.filter((record) => current.some((candidate) => candidate.pid === record.pid && candidate.createdAt === record.createdAt));
        if (outcome.status !== 0 && remaining.some((record) => record.pid === root.pid)) throw new Error("Windows process-tree termination was refused");
      }
      await withinProcessDeadline(sleep(remainingProcessBudget(deadline, 50)), deadline);
    }
    assertWithinDeadline();
    const finalState = await captureProcessTree(child, deadline);
    assertWithinDeadline();
    if (finalState.live.length > 0 || !(await withinProcessDeadline(waitForCondition(() => childHasExited(child), remainingProcessBudget(deadline, 5_000)), deadline))) {
      throw new Error("Could not verify termination of the Windows process tree");
    }
  } else {
    const signalGroup = (nextSignal) => {
      try { process.kill(-pid, nextSignal); } catch (error) { if (error?.code !== "ESRCH") throw error; }
    };
    if (posixProcessGroupExists(pid, deadline)) signalGroup(signal);
    if (!(await withinProcessDeadline(waitForCondition(() => !posixProcessGroupExists(pid, deadline) && childHasExited(child), remainingProcessBudget(deadline, 2_000)), deadline))) signalGroup("SIGKILL");
    if (!(await withinProcessDeadline(waitForCondition(() => !posixProcessGroupExists(pid, deadline) && childHasExited(child), remainingProcessBudget(deadline, 5_000)), deadline))) {
      throw new Error("Could not verify termination of the POSIX process group");
    }
  }
  assertWithinDeadline();
  if (child.ghostinitProcessTree?.unverified) throw new Error("Unverified Windows descendant evidence prevents cleanup certification");
  await withinProcessDeadline(Promise.resolve(completion).catch(() => undefined), deadline);
  assertWithinDeadline();
  if (child.ghostinitProcessTree?.unverified) throw new Error("Unverified Windows descendant evidence prevents cleanup certification");
}
`;
}
