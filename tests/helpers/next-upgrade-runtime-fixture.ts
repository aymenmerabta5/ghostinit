import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface UpgradeConnection {
  readonly socket: Socket;
  response(): Promise<number>;
  sendUpgrade(path: string, authenticated?: boolean): Promise<number>;
}

export function connectUpgrade(port: number): UpgradeConnection {
  const socket = connect({ host: "127.0.0.1", port });
  let pending = "";
  const statuses: number[] = [];
  const waiters: Array<{ resolve(status: number): void; reject(error: Error): void }> = [];
  socket.on("data", (chunk) => {
    pending += chunk.toString();
    while (pending.includes("\r\n\r\n")) {
      const end = pending.indexOf("\r\n\r\n") + 4;
      const response = pending.slice(0, end);
      pending = pending.slice(end);
      const match = /^HTTP\/1\.[01] (\d{3})/.exec(response);
      if (!match) continue;
      const status = Number(match[1]);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(status);
      else statuses.push(status);
    }
  });
  socket.on("error", () => {});
  socket.once("close", () => {
    for (const waiter of waiters.splice(0)) {
      waiter.reject(new Error("Socket closed before an upgrade response"));
    }
  });
  const response = () => {
    const status = statuses.shift();
    if (status !== undefined) return Promise.resolve(status);
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Upgrade response exceeded its bound")),
        7_000,
      );
      waiters.push({
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  };
  return {
    socket,
    response,
    sendUpgrade(path, authenticated = false) {
      socket.write(
        [
          `GET ${path} HTTP/1.1`,
          `Host: 127.0.0.1:${port}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          "Sec-WebSocket-Version: 13",
          "Sec-WebSocket-Key: Z2hvc3Rpbml0LXByb2JlIQ==",
          ...(authenticated ? ["Authorization: fixture"] : []),
          "",
          "",
        ].join("\r\n"),
      );
      return response();
    },
  };
}

export async function startNextUpgradeFixture(
  generated: string,
  runtime: "node" | "bun",
  development: boolean,
): Promise<{ port: number; close(): Promise<void> }> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-next-upgrade-"));
  const start = generated.indexOf("class ApplicationHttpServer");
  const end = generated.indexOf("const app = next(", start);
  const rejectionStart = generated.indexOf("function rejectUpgrade(");
  const rejectionEnd = generated.indexOf("async function currentIdentity(", rejectionStart);
  if ([start, end, rejectionStart, rejectionEnd].some((index) => index < 0)) {
    throw new Error("Generated Next upgrade source boundaries changed");
  }
  const dispatcher = generated.slice(start, end);
  const rejection = generated.slice(rejectionStart, rejectionEnd);
  const source = [
    'import { IncomingMessage, Server } from "node:http";',
    'import { Duplex } from "node:stream";',
    'import { createHash } from "node:crypto";',
    "let nextInstalled = false;",
    "const connections = new Set();",
    "function handshake(request, socket) {",
    '  const accept = createHash("sha1").update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");',
    '  socket.write("HTTP/1.1 101 Switching Protocols\\r\\nConnection: Upgrade\\r\\nUpgrade: websocket\\r\\nSec-WebSocket-Accept: " + accept + "\\r\\n\\r\\n");',
    "}",
    "async function upgradeRequest(request, socket) {",
    '  if (request.headers.authorization !== "fixture") return rejectUpgrade(socket, 401, "Unauthorized");',
    "  handshake(request, socket);",
    "}",
    "function handle(request, response) {",
    "  if (!nextInstalled) { installNextUpgradeHandler(); nextInstalled = true; }",
    '  response.writeHead(200, { "Content-Length": "0", "Connection": "keep-alive" });',
    "  response.end();",
    "}",
    rejection,
    dispatcher,
    'server.on("connection", (socket) => { connections.add(socket); socket.on("close", () => connections.delete(socket)); });',
    "function installNextUpgradeHandler() {",
    'server.on("upgrade", async (request, socket) => {',
    '  if (request.url === "/install-prefix/_next/hmr?id=native-probe") handshake(request, socket);',
    '  else if (request.url === "/early-error") socket.emit("error", new Error("fixture reset"));',
    '  else if (new URL(request.url, "http://localhost").pathname === "/api/ws") {',
    "    await new Promise((resolve) => setImmediate(resolve));",
    "    socket.destroy();",
    "  }",
    "});",
    "}",
    'server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port })));',
    'process.stdin.on("end", () => {',
    "  for (const socket of connections) socket.destroy();",
    "  server.close(() => process.exit(0));",
    "});",
    "process.stdin.resume();",
  ].join("\n");
  const entry = join(root, "server.mjs");
  writeFileSync(
    entry,
    new Bun.Transpiler({
      loader: "ts",
      target: "node",
      define: {
        "process.env.NODE_ENV": JSON.stringify(development ? "development" : "production"),
      },
    }).transformSync(source),
  );
  const child = spawn(runtime === "bun" ? process.execPath : "node", [entry], {
    cwd: root,
    env: { ...process.env, NODE_ENV: development ? "development" : "production" },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;
  let output = "";
  let stderrBytes = 0;
  child.stderr.on("data", (chunk) => {
    stderrBytes += chunk.length;
  });
  const completed = once(child, "close");
  const close = async () => {
    child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    try {
      await completed;
    } finally {
      clearTimeout(timer);
    }
    if (child.exitCode !== 0)
      throw new Error(
        `Upgrade fixture failed: status=${child.exitCode}, stderrBytes=${stderrBytes}`,
      );
    rmSync(root, { recursive: true, force: true });
  };
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Upgrade fixture did not listen")), 5_000);
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (!output.includes("\n")) return;
        clearTimeout(timer);
        resolve((JSON.parse(output.split("\n")[0]!) as { port: number }).port);
      });
      void completed.then(() => {
        clearTimeout(timer);
        reject(new Error(`Upgrade fixture exited: stderrBytes=${stderrBytes}`));
      });
    });
    return { port, close };
  } catch (error) {
    await close();
    throw error;
  }
}
