import { spawn, type ChildProcess } from "node:child_process";

export interface TaskkillOutcome {
  status: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timedOut: boolean;
  spawnError?: Error;
}

export class ProcessTreeTerminationError extends Error {}

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

async function waitForProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-pid, 0);
    } catch {
      return true;
    }
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 50));
  }
  return false;
}

async function runWindowsTaskkill(pid: number, timeoutMs = 10_000): Promise<void> {
  let killer: ChildProcess;
  try {
    killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    assertSuccessfulTaskkill(pid, {
      status: null,
      signal: null,
      stderr: "",
      timedOut: false,
      spawnError: error instanceof Error ? error : new Error(String(error)),
    });
    return;
  }

  let stderr = "";
  killer.stderr?.setEncoding("utf8");
  killer.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const outcome = await new Promise<TaskkillOutcome>((resolveOutcome) => {
    let settled = false;
    const finish = (result: TaskkillOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killer.off("close", closed);
      killer.off("error", errored);
      resolveOutcome(result);
    };
    const closed = (status: number | null, signal: NodeJS.Signals | null): void =>
      finish({ status, signal, stderr, timedOut: false });
    const errored = (error: Error): void =>
      finish({ status: null, signal: null, stderr, timedOut: false, spawnError: error });
    const timer = setTimeout(() => {
      killer.kill();
      finish({
        status: killer.exitCode,
        signal: killer.signalCode,
        stderr,
        timedOut: true,
      });
    }, timeoutMs);
    killer.once("close", closed);
    killer.once("error", errored);
  });
  assertSuccessfulTaskkill(pid, outcome);
}

export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const pid = child.pid;
  if (pid === undefined) {
    throw new ProcessTreeTerminationError("Cannot terminate a live process tree without a PID");
  }

  if (process.platform === "win32") {
    await runWindowsTaskkill(pid);
    if (!(await waitForExit(child, 5_000))) {
      throw new ProcessTreeTerminationError(
        `Windows process tree ${pid} remained alive after successful taskkill`,
      );
    }
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    if (!(await waitForExit(child, 1_000))) {
      throw new ProcessTreeTerminationError(`POSIX process tree ${pid} could not receive SIGTERM`);
    }
    return;
  }
  const childExitedAfterTerm = await waitForExit(child, 2_000);
  const groupExitedAfterTerm = await waitForProcessGroupExit(pid, 2_000);
  if (childExitedAfterTerm && groupExitedAfterTerm) return;

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group may have exited between the condition check and SIGKILL.
  }
  const childExitedAfterKill = await waitForExit(child, 5_000);
  const groupExitedAfterKill = await waitForProcessGroupExit(pid, 5_000);
  if (!childExitedAfterKill || !groupExitedAfterKill) {
    throw new ProcessTreeTerminationError(
      `POSIX process tree ${pid} did not terminate after SIGKILL`,
    );
  }
}
