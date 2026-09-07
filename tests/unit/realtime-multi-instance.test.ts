import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { realtimePackage } from "../../src/templates/realtime.js";

interface RuntimeModule {
  clearAll(): void;
  publish(
    conversationId: string,
    event: {
      type: "message";
      conversationId: string;
      messageId: string;
      userId: string;
      timestamp: number;
    },
  ): Promise<void>;
  subscribeAuthorized(
    userId: string,
    conversationId: string,
    authorizeConversation: (conversationId: string, userId: string) => Promise<boolean>,
    handler: (event: {
      type: "message";
      conversationId: string;
      messageId: string;
      userId: string;
      timestamp: number;
    }) => void,
  ): Promise<() => void>;
}

test("Upstash SSE bridges events between instances and surfaces publish failures", async () => {
  const generated = realtimePackage("single").find((entry) =>
    entry.path.endsWith("server/realtime/index.ts"),
  );
  expect(generated).toBeDefined();
  const source = generated?.content.replace(
    'import { env } from "@/lib/env/server";',
    `const env = {
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  BETTER_AUTH_URL: "https://app.example.test",
  SITE_URL: "https://app.example.test",
};`,
  );
  if (!source) throw new Error("Missing generated realtime source");
  expect(source).not.toContain("ReadableStreamReadResult");
  expect(source).toContain("return await Promise.race([reader.read(), deadline])");

  const root = mkdtempSync(join(tmpdir(), "ghostinit-realtime-multi-"));
  const firstPath = join(root, "first.ts");
  const secondPath = join(root, "second.ts");
  writeFileSync(firstPath, source);
  writeFileSync(secondPath, source);

  const originalFetch = globalThis.fetch;
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const pipelineBodies: unknown[] = [];
  const subscribeMethods: Array<string | undefined> = [];
  let subscribeCount = 0;
  let failPublish = false;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/subscribe/")) {
      subscribeCount += 1;
      subscribeMethods.push(init?.method);
      const channel = decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streams.add(controller);
          controller.enqueue(encoder.encode(`data: subscribe,${channel},1\n\n`));
        },
        cancel() {
          // Individual modules abort their own subscriber during clearAll().
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    if (url.endsWith("/pipeline")) {
      if (failPublish) return new Response("down", { status: 503 });
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      pipelineBodies.push(body);
      if (!Array.isArray(body) || !Array.isArray(body[0]) || typeof body[0][2] !== "string") {
        return new Response(JSON.stringify([{ error: "invalid pipeline" }]), { status: 200 });
      }
      const channel = typeof body[0][1] === "string" ? body[0][1] : "";
      const event = encoder.encode(`data: message,${channel},${body[0][2]}\n\n`);
      for (const stream of streams) stream.enqueue(event);
      return Response.json([{ result: streams.size }]);
    }
    return new Response("unexpected request", { status: 500 });
  };

  let first: RuntimeModule | undefined;
  let second: RuntimeModule | undefined;
  try {
    first = (await import(pathToFileURL(firstPath).href)) as RuntimeModule;
    second = (await import(pathToFileURL(secondPath).href)) as RuntimeModule;

    const delivered: Array<{ type: string; conversationId: string; messageId: string }> = [];
    const unsubscribe = await second.subscribeAuthorized(
      "recipient",
      "conversation-1",
      async () => true,
      (event) => delivered.push(event),
    );

    await first.publish("conversation-1", {
      type: "message",
      conversationId: "conversation-1",
      messageId: "message-1",
      userId: "sender",
      timestamp: 1,
    });
    for (let attempt = 0; attempt < 50 && delivered.length === 0; attempt++) {
      await Bun.sleep(5);
    }

    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      type: "message",
      conversationId: "conversation-1",
      messageId: "message-1",
    });
    expect(pipelineBodies).toHaveLength(1);
    expect(pipelineBodies[0]).toEqual([
      ["PUBLISH", expect.stringMatching(/^ghostinit-realtime:/), expect.any(String)],
    ]);
    expect(subscribeMethods).toEqual(["POST", "POST"]);

    for (const stream of streams) {
      streams.delete(stream);
      stream.close();
    }
    for (let attempt = 0; attempt < 100 && subscribeCount < 4; attempt++) {
      await Bun.sleep(10);
    }
    expect(subscribeCount).toBeGreaterThanOrEqual(4);

    await first.publish("conversation-1", {
      type: "message",
      conversationId: "conversation-1",
      messageId: "message-2",
      userId: "sender",
      timestamp: 2,
    });
    for (let attempt = 0; attempt < 50 && delivered.length < 2; attempt++) {
      await Bun.sleep(5);
    }
    expect(delivered).toHaveLength(2);
    unsubscribe();

    failPublish = true;
    await expect(
      first.publish("conversation-1", {
        type: "message",
        conversationId: "conversation-1",
        messageId: "message-3",
        userId: "sender",
        timestamp: 3,
      }),
    ).rejects.toThrow("Realtime publish failed with status 503");
  } finally {
    first?.clearAll();
    second?.clearAll();
    for (const stream of streams) {
      try {
        stream.close();
      } catch {
        // It may already have been closed by module cleanup.
      }
    }
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
});
