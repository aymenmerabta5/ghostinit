import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { captureWindowsProcessIdentity, isCapturedWindowsProcessLive } from "./process-tree.js";
import { capturePosixProcessIdentity } from "./posix-process-tree.js";

interface WorkerMessage {
  protocol: number;
  pid: number;
  type: string;
  port?: number;
  nodeVersion?: string;
  message?: string;
}

// Await native I/O directly: Bun's rejects.toThrow can stall ChildProcess stdout completion.
export async function lifecycleRejection(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected fixture lifecycle operation to reject");
}

export async function observeWorkerExit(pid: number): Promise<() => Promise<void>> {
  let exited: () => Promise<boolean>;
  if (process.platform === "win32") {
    const identity = await captureWindowsProcessIdentity(pid);
    if (!identity) throw new Error("Worker exited before identity capture");
    exited = async () => !(await isCapturedWindowsProcessLive(identity));
  } else {
    const identity = capturePosixProcessIdentity(pid);
    exited = async () => {
      try {
        return capturePosixProcessIdentity(pid).started !== identity.started;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "The spawned POSIX process is no longer live"
        )
          return true;
        throw error;
      }
    };
  }
  return async () => {
    const end = Date.now() + 15_000;
    while (!(await exited())) {
      if (Date.now() >= end) throw new Error("Owned PostgreSQL worker remained live");
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
  };
}

export function deadline<T>(promise: Promise<T>, milliseconds = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture lifecycle deadline exceeded")),
      milliseconds,
    );
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function launchPostgresLifecycle(entry: string, nodeArgs: string[] = []) {
  const node = Bun.which("node");
  if (!node) throw new Error("Node is required for PostgreSQL lifecycle tests");
  const child: ChildProcessWithoutNullStreams = spawn(node, [...nodeArgs, entry], {
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
    windowsHide: true,
  });
  const messages: WorkerMessage[] = [];
  const events = new EventEmitter();
  let output = "";
  let stderr = "";
  let spawnError: Error | undefined;
  let finished = false;
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.once("close", (code, signal) => {
        finished = true;
        resolve({ code, signal });
        events.emit("changed");
      });
    },
  );
  child.on("error", (error) => {
    spawnError = error;
    events.emit("changed");
  });
  child.stdin.on("error", () => undefined);
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
    let end: number;
    while ((end = output.indexOf("\n")) >= 0) {
      const line = output.slice(0, end);
      output = output.slice(end + 1);
      try {
        messages.push(JSON.parse(line) as WorkerMessage);
      } catch {
        spawnError = new Error(`Invalid worker test output: ${line}`);
      }
      events.emit("changed");
    }
  });
  return {
    child,
    completed,
    messages,
    async message(type: string): Promise<WorkerMessage> {
      let changed!: () => void;
      const waiting = new Promise<WorkerMessage>((resolve, reject) => {
        changed = () => {
          const value = messages.find((message) => message.type === type);
          if (value) resolve(value);
          else if (spawnError || finished)
            reject(spawnError ?? new Error(`Worker exited without ${type}: ${stderr}`));
        };
        events.on("changed", changed);
        changed();
      });
      try {
        return await deadline(waiting);
      } finally {
        events.off("changed", changed);
      }
    },
    async cleanup(): Promise<void> {
      if (!finished) child.stdin.end();
      try {
        await deadline(completed);
      } catch (error) {
        child.kill("SIGKILL");
        await deadline(completed, 5_000);
        throw error;
      }
    },
  };
}

export async function rebindPostgresPort(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
