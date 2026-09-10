const SHUTDOWN_TIMEOUT_MS = 10_000;
const MAX_COMMAND_BYTES = 1_024;
let stopping = false;
let failure;
let database;
let server;
let shutdownTimer;
let outputAvailable = true;
let resolveStop;
const stopped = new Promise((resolve) => {
  resolveStop = resolve;
});

function requestStop(error) {
  failure ??= error;
  if (stopping) return;
  stopping = true;
  shutdownTimer = setTimeout(() => {
    process.stderr.write("PostgreSQL worker cleanup deadline exceeded\n");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  shutdownTimer.unref();
  resolveStop();
}

async function emit(message) {
  if (!outputAvailable) return;
  await new Promise((resolve) => {
    process.stdout.write(
      JSON.stringify({ protocol: 1, pid: process.pid, ...message }) + "\n",
      (error) => {
        if (error) outputAvailable = false;
        resolve();
      },
    );
  });
}

// Register owner-loss handling before imports/initdb: EOF during startup must not leak a server.
process.stdout.on("error", () => {
  outputAvailable = false;
  requestStop();
});
process.stdin.on("end", () => requestStop());
process.stdin.on("error", (error) => requestStop(error));
process.on("SIGTERM", () => requestStop());
process.on("SIGINT", () => requestStop());
let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  if (Buffer.byteLength(pending) > MAX_COMMAND_BYTES) {
    pending = "";
    requestStop(new Error("PostgreSQL worker command exceeded its protocol bound"));
    return;
  }
  let end;
  while ((end = pending.indexOf("\n")) >= 0) {
    const command = pending.slice(0, end).trim();
    pending = pending.slice(end + 1);
    requestStop(command === "close" ? undefined : new Error("Invalid PostgreSQL worker command"));
  }
});
process.stdin.resume();

try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (process.versions.bun || major < 22 || (major === 22 && minor < 12))
    throw new Error("Node.js >=22.12.0 is required for the PostgreSQL test fixture");
  const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite-socket"),
  ]);
  if (!stopping) {
    database = await PGlite.create({
      startParams: [...PGlite.defaultStartParams, "-c", "shared_buffers=16MB"],
    });
  }
  if (!stopping) {
    server = new PGLiteSocketServer({
      db: database,
      host: "127.0.0.1",
      maxConnections: 32,
      port: 0,
    });
    await server.start();
  }
  if (!stopping) {
    const endpoint = server.getServerConn();
    const port = Number(/^127\.0\.0\.1:(\d+)$/.exec(endpoint)?.[1]);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
      throw new Error("PostgreSQL worker returned an invalid loopback endpoint");
    await emit({ type: "ready", port, nodeVersion: process.versions.node });
    await stopped;
  }
} catch (error) {
  requestStop(error);
} finally {
  try {
    if (server) await server.stop();
  } catch (error) {
    failure ??= error;
  }
  try {
    if (database) await database.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure) {
    await emit({
      type: "error",
      message: failure instanceof Error ? failure.message : String(failure),
    });
    process.exitCode = 1;
  } else await emit({ type: "closed" });
  // A failed stop may retain native handles after the parent has disappeared.
  if (!failure) clearTimeout(shutdownTimer);
  process.stdin.destroy();
}
