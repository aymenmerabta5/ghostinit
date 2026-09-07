/**
 * Built Next-style WS and Nitro/CrossWS oRPC transport guard probe.
 *
 * Opt in with NITRO_WEBSOCKET_RUNTIME=1. The default focused suite stays
 * install-free, while release verification can build the exact pinned Nitro
 * runtime and prove that the generated Nitro transport guard routes a typed
 * oRPC event iterator over a real websocket upgrade.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  orpc,
  realtime,
  runtime,
  tanstackStart,
  validation,
} from "../../packages/versions/src/index.js";
import { messagingFilesFor } from "../../src/templates/apps/fragments/messaging/index.js";
import { minimumReleaseAgeBunfigContent } from "../helpers/bunfig.js";
import { rawWebSocketUpgradeStatus } from "./e2e-build-process.js";

const runtimeEnabled = process.env.NITRO_WEBSOCKET_RUNTIME === "1";
const describeRuntime = runtimeEnabled ? describe : describe.skip;
const commandTimeoutMs = 10 * 60 * 1000;
const commandOutputBytes = 16 * 1024 * 1024;
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runBun(args: string[], cwd: string): void {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: commandOutputBytes,
    shell: false,
    timeout: commandTimeoutMs,
    windowsHide: true,
  });
  expect(result.error, result.error?.message).toBeUndefined();
  expect(
    result.status,
    `bun ${args.join(" ")} failed:\n${result.stdout.slice(-4_000)}\n${result.stderr.slice(-4_000)}`,
  ).toBe(0);
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a TCP port");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForServer(child: ChildProcess, url: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`Nitro exited before readiness: ${child.exitCode}`);
    try {
      await fetch(url);
      return;
    } catch {
      await Bun.sleep(25);
    }
  }
  throw new Error("Timed out waiting for the built Nitro server");
}

describeRuntime("oRPC websocket adapter compatibility (opt-in)", () => {
  test(
    "catalog-pinned Next WS and Nitro/CrossWS dispatch typed oRPC streams with context",
    async () => {
      expect(Bun.version).toBe(runtime.bun);
      const compatibility = messagingFilesFor("tanstack-start", "postgres", ["web"], "single").find(
        (entry) => entry.path === "server/plugins/00-nitro-websocket-compat.ts",
      )?.content;
      if (!compatibility) throw new Error("Generated Nitro websocket adapter missing");

      const root = mkdtempSync(join(tmpdir(), "ghostinit-nitro-ws-"));
      temporaryRoots.push(root);
      mkdirSync(join(root, "server", "plugins"), { recursive: true });
      mkdirSync(join(root, "server", "routes", "api"), { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          private: true,
          type: "module",
          scripts: { build: "nitro build" },
          dependencies: {
            "@orpc/client": orpc["@orpc/client"],
            "@orpc/contract": orpc["@orpc/contract"],
            "@orpc/server": orpc["@orpc/server"],
            crossws: realtime.crossws,
            nitro: tanstackStart.nitro,
            ws: realtime.ws,
            zod: validation.zod,
          },
        }),
      );
      writeFileSync(join(root, "bunfig.toml"), minimumReleaseAgeBunfigContent());
      writeFileSync(
        join(root, "nitro.config.ts"),
        `import { defineNitroConfig } from "nitro/config";
export default defineNitroConfig({
  preset: "bun",
  serverDir: "server",
  experimental: { websocket: true },
  plugins: ["./server/plugins/00-nitro-websocket-compat.ts"],
});
`,
      );
      writeFileSync(join(root, "server", "plugins", "00-nitro-websocket-compat.ts"), compatibility);
      writeFileSync(
        join(root, "router.ts"),
        `import { eventIterator, oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    conversationId: z.string(),
    messageId: z.string(),
    actorId: z.string(),
  }),
]);
interface ProbeContext { actorId: string }
const contract = {
  subscribe: oc
    .input(z.object({ conversationId: z.string() }))
    .output(eventIterator(eventSchema)),
};
const implementer = implement<typeof contract, ProbeContext>(contract);
export const appRouter = implementer.router({
  subscribe: implementer.subscribe.handler(({ input, context }) =>
    (async function* stream() {
      yield {
        type: "message" as const,
        conversationId: input.conversationId,
        messageId: "runtime-message",
        actorId: context.actorId,
      };
    })(),
  ),
});
`,
      );
      writeFileSync(
        join(root, "server", "websocket-handler.ts"),
        `import { experimental_RPCHandler } from "@orpc/server/crossws";
import { defineWebSocket, defineWebSocketHandler } from "nitro/h3";
import { appRouter } from "../router";

const handler = new experimental_RPCHandler(appRouter);
export const applicationWebSocketHooks = defineWebSocket({
  upgrade(request) {
    const url = new URL(request.url);
    if (url.searchParams.get("auth-error") === "1") throw new Error("auth backend unavailable");
    if (
      url.searchParams.get("request-clone") === "1" &&
      (request.headers.get("origin") !== "https://client.ghostinit.test" ||
        request.headers.get("cookie") !== "session=clone-proof" ||
        request.headers.get("x-ghostinit-probe") !== "readonly-request")
    ) {
      console.error(JSON.stringify({
        url: request.url,
        origin: request.headers.get("origin"),
        cookie: request.headers.get("cookie"),
        probe: request.headers.get("x-ghostinit-probe"),
      }));
      return new Response("WebSocket request clone lost URL or headers", { status: 400 });
    }
    return { context: { ...request.context, actorId: "nitro-runtime" } };
  },
  message(peer, message) {
    const actorId = peer.context.actorId;
    if (typeof actorId !== "string") {
      peer.close(1008, "WebSocket context missing");
      return;
    }
    return handler.message(peer, message, { context: { actorId } });
  },
  close(peer) { handler.close(peer); },
});

export default defineWebSocketHandler(applicationWebSocketHooks);
`,
      );
      writeFileSync(
        join(root, "server", "routes", "api", "ws.ts"),
        `export { default } from "../../websocket-handler";
`,
      );
      writeFileSync(
        join(root, "client.ts"),
        `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "./router";

export async function runProbe(url: string) {
  const websocket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    websocket.addEventListener("open", () => resolve(), { once: true });
    websocket.addEventListener(
      "error",
      (event) => reject(event.error ?? new Error(event.message || "oRPC WebSocket open failed")),
      { once: true },
    );
  });
  try {
    const client: RouterClient<typeof appRouter> = createORPCClient(
      new RPCLink({ websocket }),
    );
    const iterator = await client.subscribe({ conversationId: "runtime-conversation" });
    const event = await iterator.next();
    await iterator.return?.();
    if (event.done) throw new Error("oRPC event iterator ended without a message");
    return event.value;
  } finally {
    websocket.close();
  }
}
`,
      );
      writeFileSync(
        join(root, "next-server.ts"),
        `import { createServer } from "node:http";
import { RPCHandler } from "@orpc/server/websocket";
import { WebSocketServer, type RawData } from "ws";
import { appRouter } from "./router";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const handler = new RPCHandler(appRouter);
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function rpcData(data: RawData, isBinary: boolean): string | ArrayBuffer {
  const buffer = Array.isArray(data)
    ? Buffer.concat(data)
    : data instanceof ArrayBuffer
      ? Buffer.from(data)
      : Buffer.from(data);
  return isBinary ? Uint8Array.from(buffer).buffer : buffer.toString();
}

const server = createServer((_request, response) => {
  response.statusCode = 204;
  response.end();
});
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/ws") {
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocket.on("message", (data, isBinary) => {
      void handler
        .message(websocket, rpcData(data, isBinary), { context: { actorId: "next-runtime" } })
        .catch(() => websocket.close(1011));
    });
    websocket.on("close", () => handler.close(websocket));
  });
});
server.listen(port, "127.0.0.1");
`,
      );

      runBun(["install", "--ignore-scripts"], root);
      runBun(["run", "build"], root);

      const port = await reservePort();
      const child = spawn(process.execPath, [join(root, ".output", "server", "index.mjs")], {
        cwd: root,
        env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const output: string[] = [];
      child.stdout?.on("data", (chunk) => output.push(String(chunk)));
      child.stderr?.on("data", (chunk) => output.push(String(chunk)));
      try {
        await waitForServer(child, `http://127.0.0.1:${port}/`);
        expect(
          await rawWebSocketUpgradeStatus(
            port,
            "/api/ws?request-clone=1",
            "https://client.ghostinit.test",
            {
              Cookie: "session=clone-proof",
              "X-GhostInit-Probe": "readonly-request",
            },
          ),
        ).toBe(101);
        expect(
          await rawWebSocketUpgradeStatus(
            port,
            "/api/ws?request-clone=1",
            "https://wrong.ghostinit.test",
          ),
        ).toBe(400);
        expect(
          await rawWebSocketUpgradeStatus(
            port,
            "/api/ws?auth-error=1",
            "https://client.ghostinit.test",
          ),
        ).toBe(503);
        expect(
          await rawWebSocketUpgradeStatus(port, "/api/realtime", "https://client.ghostinit.test"),
        ).toBe(404);
        const websocketUrl = `ws://127.0.0.1:${port}/api/ws`;
        const clientModule = (await import(
          `${pathToFileURL(join(root, "client.ts")).href}?run=${crypto.randomUUID()}`
        )) as {
          runProbe(url: string): Promise<unknown>;
        };
        await expect(clientModule.runProbe(websocketUrl)).resolves.toEqual({
          type: "message",
          conversationId: "runtime-conversation",
          messageId: "runtime-message",
          actorId: "nitro-runtime",
        });

        const socket = new WebSocket(websocketUrl);
        await new Promise<void>((resolve, reject) => {
          socket.addEventListener("open", () => resolve(), { once: true });
          socket.addEventListener("error", () => reject(new Error("WebSocket open failed")), {
            once: true,
          });
        });
        const rejected = new Promise<void>((resolve) => {
          socket.addEventListener("close", () => resolve(), { once: true });
          socket.addEventListener("error", () => resolve(), { once: true });
        });
        socket.send("x".repeat(64 * 1024 + 1));
        await Promise.race([
          rejected,
          Bun.sleep(5_000).then(() => {
            throw new Error("Oversized websocket frame was not rejected");
          }),
        ]);

        const nextPort = await reservePort();
        const nextChild = spawn(process.execPath, [join(root, "next-server.ts")], {
          cwd: root,
          env: { ...process.env, PORT: String(nextPort) },
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        nextChild.stdout?.on("data", (chunk) => output.push(String(chunk)));
        nextChild.stderr?.on("data", (chunk) => output.push(String(chunk)));
        try {
          await waitForServer(nextChild, `http://127.0.0.1:${nextPort}/`);
          await expect(clientModule.runProbe(`ws://127.0.0.1:${nextPort}/api/ws`)).resolves.toEqual(
            {
              type: "message",
              conversationId: "runtime-conversation",
              messageId: "runtime-message",
              actorId: "next-runtime",
            },
          );
        } finally {
          nextChild.kill();
          await new Promise<void>((resolve) => {
            if (nextChild.exitCode !== null) resolve();
            else nextChild.once("exit", () => resolve());
          });
        }
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}\n${output.join("").slice(-8_000)}`,
        );
      } finally {
        child.kill();
        await new Promise<void>((resolve) => {
          if (child.exitCode !== null) resolve();
          else child.once("exit", () => resolve());
        });
      }
    },
    commandTimeoutMs,
  );
});
