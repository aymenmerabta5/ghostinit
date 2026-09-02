import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { realtimePackage } from "../../src/templates/realtime.js";

type MessageEvent = {
  conversationId: string;
  messageId: string;
  timestamp: number;
  type: "message";
  userId: string;
};

interface RuntimeModule {
  clearAll(): void;
  publish(conversationId: string, event: MessageEvent): Promise<void>;
  startRealtimeSubscriber(): Promise<void>;
  subscribeAuthorized(
    userId: string,
    conversationId: string,
    authorizeConversation: (conversationId: string, userId: string) => Promise<boolean>,
    handler: (event: MessageEvent) => void,
    type?: "message" | "presence" | "read" | "typing",
    subscriptionOwnerId?: string,
    onRevoked?: () => void,
    authorizationRecheckMs?: number,
  ): Promise<() => void>;
}

type LoadedRuntime = {
  dispose(): void;
  runtime: RuntimeModule;
};

async function loadRuntime(
  options: {
    authorizationTimeoutMs?: number;
    redisToken?: string;
    redisUrl?: string;
    requestTimeoutMs?: number;
    streamIdleTimeoutMs?: number;
  } = {},
): Promise<LoadedRuntime> {
  const generated = realtimePackage("single").find((entry) =>
    entry.path.endsWith("server/realtime/index.ts"),
  );
  if (!generated) throw new Error("Missing generated realtime runtime");
  let source = generated.content.replace(
    'import { env } from "@/lib/env/server";',
    `const env = ${JSON.stringify({
      BETTER_AUTH_URL: "https://app.example.test",
      UPSTASH_REDIS_REST_TOKEN: options.redisToken ?? "",
      UPSTASH_REDIS_REST_URL: options.redisUrl ?? "",
    })};`,
  );
  if (options.requestTimeoutMs !== undefined) {
    source = source.replace(
      "const REDIS_REQUEST_TIMEOUT_MS = 10_000;",
      `const REDIS_REQUEST_TIMEOUT_MS = ${options.requestTimeoutMs};`,
    );
  }
  if (options.authorizationTimeoutMs !== undefined) {
    source = source.replace(
      "export const REALTIME_AUTHORIZATION_TIMEOUT_MS = 5_000;",
      `export const REALTIME_AUTHORIZATION_TIMEOUT_MS = ${options.authorizationTimeoutMs};`,
    );
  }
  if (options.streamIdleTimeoutMs !== undefined) {
    source = source.replace(
      "const REDIS_STREAM_IDLE_TIMEOUT_MS = 75_000;",
      `const REDIS_STREAM_IDLE_TIMEOUT_MS = ${options.streamIdleTimeoutMs};`,
    );
  }
  const root = mkdtempSync(join(tmpdir(), "ghostinit-realtime-security-"));
  const path = join(root, "runtime.ts");
  writeFileSync(path, source);
  const runtime = (await import(pathToFileURL(path).href)) as RuntimeModule;
  return {
    runtime,
    dispose() {
      runtime.clearAll();
      rmSync(root, { force: true, recursive: true });
    },
  };
}

function event(messageId: string): MessageEvent {
  return {
    type: "message",
    conversationId: "conversation-1",
    messageId,
    userId: "sender-1",
    timestamp: Date.now(),
  };
}

test("realtime blocks an event immediately when authoritative authorization is revoked", async () => {
  const loaded = await loadRuntime();
  let authorized = true;
  let delivered = 0;
  let revoked = 0;
  try {
    await loaded.runtime.subscribeAuthorized(
      "user-1",
      "conversation-1",
      async () => authorized,
      () => {
        delivered += 1;
      },
      undefined,
      "session-1",
      () => {
        revoked += 1;
      },
      60_000,
    );
    authorized = false;
    await loaded.runtime.publish("conversation-1", event("message-1"));
    expect(delivered).toBe(0);
    expect(revoked).toBe(1);
  } finally {
    loaded.dispose();
  }
});

test("realtime periodically terminates an idle revoked subscription", async () => {
  const loaded = await loadRuntime();
  let authorized = true;
  let revoked = 0;
  try {
    await loaded.runtime.subscribeAuthorized(
      "user-1",
      "conversation-1",
      async () => authorized,
      () => undefined,
      undefined,
      "session-1",
      () => {
        revoked += 1;
      },
      100,
    );
    authorized = false;
    for (let attempt = 0; attempt < 30 && revoked === 0; attempt += 1) await Bun.sleep(10);
    expect(revoked).toBe(1);
  } finally {
    loaded.dispose();
  }
});

test("realtime fails closed when authoritative authorization exceeds its deadline", async () => {
  const loaded = await loadRuntime({ authorizationTimeoutMs: 25 });
  try {
    await expect(
      loaded.runtime.subscribeAuthorized(
        "user-1",
        "conversation-1",
        async () => await new Promise<boolean>(() => undefined),
        () => undefined,
      ),
    ).rejects.toThrow("Conversation access denied");
  } finally {
    loaded.dispose();
  }
});

test("realtime rejects external cleartext, credentialed, and non-origin Redis URLs before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("unexpected");
  }) as typeof fetch;
  try {
    for (const redisUrl of [
      "http://redis.example.test",
      "https://user:password@redis.example.test",
      "https://redis.example.test/prefix",
    ]) {
      const loaded = await loadRuntime({ redisToken: "test-token", redisUrl });
      try {
        await expect(loaded.runtime.startRealtimeSubscriber()).rejects.toThrow(
          "UPSTASH_REDIS_REST_URL",
        );
      } finally {
        loaded.dispose();
      }
    }
    expect(fetchCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("realtime subscription fails closed when the Redis stream never acknowledges", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start() {},
      }),
      { status: 200 },
    )) as typeof fetch;
  const loaded = await loadRuntime({
    redisToken: "test-token",
    redisUrl: "https://redis.example.test",
    requestTimeoutMs: 100,
    streamIdleTimeoutMs: 25,
  });
  try {
    await expect(loaded.runtime.startRealtimeSubscriber()).rejects.toThrow(
      "stream exceeded its idle deadline",
    );
  } finally {
    loaded.dispose();
    globalThis.fetch = originalFetch;
  }
});

test("realtime bounds the subscribe handshake even when Redis streams heartbeats", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("\n"));
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  const loaded = await loadRuntime({
    redisToken: "test-token",
    redisUrl: "https://redis.example.test",
    requestTimeoutMs: 25,
    streamIdleTimeoutMs: 100,
  });
  try {
    await expect(loaded.runtime.startRealtimeSubscriber()).rejects.toThrow(
      "subscribe request exceeded its deadline",
    );
  } finally {
    loaded.dispose();
    globalThis.fetch = originalFetch;
  }
});

test("realtime publish aborts when the Redis pipeline exceeds its deadline", async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = ((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/subscribe/")) {
      const channel = decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
      return Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(`data: subscribe,${channel},1\n\n`));
            },
          }),
          { status: 200 },
        ),
      );
    }
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof fetch;
  const loaded = await loadRuntime({
    redisToken: "test-token",
    redisUrl: "https://redis.example.test",
    requestTimeoutMs: 25,
    streamIdleTimeoutMs: 100,
  });
  try {
    await loaded.runtime.startRealtimeSubscriber();
    await expect(loaded.runtime.publish("conversation-1", event("message-1"))).rejects.toThrow(
      "Realtime publish request exceeded its deadline",
    );
  } finally {
    loaded.dispose();
    globalThis.fetch = originalFetch;
  }
});
