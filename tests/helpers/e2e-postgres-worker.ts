import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const READY_TIMEOUT_MS = 60_000;
const CLOSE_TIMEOUT_MS = 15_000;
const KILL_TIMEOUT_MS = 5_000;
const MAX_MESSAGE_BYTES = 4_096;
const MAX_STDERR_BYTES = 32_768;

interface WorkerOptions {
  workerPath: string;
  nodeExecutable?: string;
  readyTimeoutMs?: number;
  closeTimeoutMs?: number;
}

export interface PostgresWorker {
  readonly port: number;
  readonly pid: number;
  readonly nodeVersion: string;
  close(): Promise<void>;
}

function bounded<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
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

function timeout(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > 120_000)
    throw new Error("Invalid PostgreSQL worker deadline");
  return result;
}

/** The worker starts no descendants; it stays directly inside the caller's process tree. */
export async function startPostgresWorker(options: WorkerOptions): Promise<PostgresWorker> {
  const node = options.nodeExecutable ?? Bun.which("node");
  if (!node) throw new Error("Node.js >=22.12.0 is required for the PostgreSQL test fixture");
  const readyTimeout = timeout(options.readyTimeoutMs, READY_TIMEOUT_MS);
  const closeTimeout = timeout(options.closeTimeoutMs, CLOSE_TIMEOUT_MS);
  const child: ChildProcessWithoutNullStreams = spawn(node, [options.workerPath], {
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
    windowsHide: true,
  });
  let stderr = "";
  let output = "";
  let outputBytes = 0;
  let failure: Error | undefined;
  let inputFailure: Error | undefined;
  let closing = false;
  let acknowledgedClose = false;
  let readyValue: Omit<PostgresWorker, "close"> | undefined;
  let closePromise: Promise<void> | undefined;
  let resolveReady!: (value: Omit<PostgresWorker, "close">) => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<Omit<PostgresWorker, "close">>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  function fail(error: Error): void {
    failure ??= error;
    rejectReady(error);
    if (readyValue && !closing) void close().catch(() => undefined);
  }
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.once("close", (code, signal) => {
        if (output.length > 0)
          fail(new Error("PostgreSQL worker ended with an unterminated protocol message"));
        if (!closing)
          fail(
            new Error(
              `PostgreSQL worker exited unexpectedly (${code}/${signal})${stderr ? `: ${stderr}` : ""}`,
            ),
          );
        resolve({ code, signal });
      });
    },
  );
  child.on("error", (error) => fail(error));
  child.stdin.on("error", (error) => {
    inputFailure = error;
    fail(error);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_BYTES);
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > MAX_MESSAGE_BYTES * 3) {
      fail(new Error("PostgreSQL worker output exceeded its protocol bound"));
      return;
    }
    output += chunk;
    if (Buffer.byteLength(output) > MAX_MESSAGE_BYTES) {
      fail(new Error("PostgreSQL worker message exceeded its protocol bound"));
      return;
    }
    let end: number;
    while ((end = output.indexOf("\n")) >= 0) {
      const line = output.slice(0, end);
      output = output.slice(end + 1);
      try {
        const message: unknown = JSON.parse(line);
        if (
          !message ||
          typeof message !== "object" ||
          Reflect.get(message, "protocol") !== 1 ||
          Reflect.get(message, "pid") !== child.pid
        )
          throw new Error("Invalid PostgreSQL worker protocol identity");
        const type = Reflect.get(message, "type");
        if (type === "error") {
          const detail = Reflect.get(message, "message");
          throw new Error(
            typeof detail === "string"
              ? `PostgreSQL worker: ${detail}`
              : "PostgreSQL worker failed",
          );
        }
        if (type === "closed") {
          if (!closing || acknowledgedClose)
            throw new Error("Unexpected PostgreSQL worker close acknowledgement");
          acknowledgedClose = true;
          continue;
        }
        const port = Reflect.get(message, "port");
        const nodeVersion = Reflect.get(message, "nodeVersion");
        const version =
          typeof nodeVersion === "string" ? /^(\d+)\.(\d+)\.\d+/.exec(nodeVersion) : null;
        const supportedNode =
          version &&
          (Number(version[1]) > 22 || (Number(version[1]) === 22 && Number(version[2]) >= 12));
        if (
          type !== "ready" ||
          readyValue ||
          failure ||
          closing ||
          !Number.isInteger(port) ||
          port < 1 ||
          port > 65_535 ||
          !supportedNode
        )
          throw new Error("Invalid PostgreSQL worker readiness message");
        readyValue = { port, pid: child.pid!, nodeVersion };
        resolveReady(readyValue);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  function close(): Promise<void> {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      if (child.exitCode === null && child.signalCode === null && child.pid)
        child.stdin.end("close\n");
      let result: Awaited<typeof completed>;
      try {
        result = await bounded(completed, closeTimeout, "PostgreSQL worker shutdown timed out");
      } catch (error) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await bounded(
          completed,
          KILL_TIMEOUT_MS,
          "PostgreSQL worker did not exit after termination",
        );
        throw error;
      }
      if (failure && failure !== inputFailure) throw failure;
      if (result.code !== 0 || result.signal !== null || !acknowledgedClose)
        throw new Error(
          `PostgreSQL worker cleanup was not confirmed (${result.code}/${result.signal})${stderr ? `: ${stderr}` : ""}`,
        );
      if (failure) throw failure;
    })();
    void closePromise.catch(() => undefined);
    return closePromise;
  }

  try {
    const value = await bounded(ready, readyTimeout, "PostgreSQL worker readiness timed out");
    if (failure) throw failure;
    if (closing || child.exitCode !== null || child.signalCode !== null)
      throw new Error("PostgreSQL worker stopped before readiness handoff");
    return { ...value, close };
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      if (cleanupError !== error)
        throw new AggregateError(
          [error, cleanupError],
          "PostgreSQL worker startup and cleanup failed",
        );
    }
    throw error;
  }
}
