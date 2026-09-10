import { describe, expect, test } from "bun:test";
import { realtime } from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { isTrustedWebSocketOrigin } from "../../src/templates/apps/fragments/messaging/index.js";

function config(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex",
): ProjectConfig {
  return {
    name: "secure-messaging",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database,
    apps: ["web"],
    billing: [],
    features: [],
    messaging: true,
  } as ProjectConfig;
}

function fileContent(
  files: ReadonlyArray<{ path: string; content: string }>,
  path: string,
): string {
  const content = files.find((file) => file.path === path)?.content;
  if (content === undefined) throw new Error(`Missing generated file: ${path}`);
  return content;
}

type NitroCloseHook = () => Promise<void>;

function loadMessagingOutboxPlugin(
  source: string,
  startMessagingOutboxWorker: () => { stop(): Promise<void> },
  runPostgresStorageCleanupWorker: (signal: AbortSignal) => Promise<void>,
): (nitroApp: { hooks: { hook(name: "close", callback: NitroCloseHook): void } }) => void {
  const executable = source
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export default definePlugin(", "const plugin = definePlugin(");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executable);
  return new Function(
    "definePlugin",
    "startMessagingOutboxWorker",
    "runPostgresStorageCleanupWorker",
    `${javascript}; return plugin;`,
  )(
    (plugin: unknown) => plugin,
    startMessagingOutboxWorker,
    runPostgresStorageCleanupWorker,
  ) as (nitroApp: { hooks: { hook(name: "close", callback: NitroCloseHook): void } }) => void;
}

describe("messaging and storage security generation matrix", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} keeps capability artifacts in the selected layout`, () => {
          const files = generateProjectFiles(config(mode, framework, database));
          if (mode === "single") {
            expect(files.filter((file) => file.path.startsWith("packages/"))).toHaveLength(0);
          }
          const messagingFiles = files.filter((file) =>
            /messag|realtime|storage|uploads/.test(file.path),
          );
          expect(messagingFiles.length).toBeGreaterThan(0);
          if (mode === "single") {
            expect(messagingFiles.filter((file) => file.content.includes("@repo/"))).toHaveLength(
              0,
            );
          }
          if (framework === "tanstack-start") {
            expect(
              messagingFiles.filter(
                (file) =>
                  file.path.includes("/src/app/") || file.content.includes('from "next/server"'),
              ),
            ).toHaveLength(0);
          }
        });
      }
    }
  }

  test("Bun serve compatibility stays type-portable across generated layouts and host OSes", () => {
    const variants = [
      fileContent(
        generateProjectFiles(config("monorepo", "tanstack-start", "postgres")),
        "apps/web/server/plugins/00-nitro-websocket-compat.ts",
      ),
      fileContent(
        generateProjectFiles(config("single", "tanstack-start", "postgres")),
        "server/plugins/00-nitro-websocket-compat.ts",
      ),
    ];
    expect(new Set(variants).size).toBe(1);
    for (const source of variants) {
      expect(source).toContain('const bunValue: unknown = Reflect.get(globalThis, "Bun")');
      expect(source).toContain("Reflect.apply(originalServe, bunRuntime, [options])");
      expect(source).not.toContain("globalThis as typeof globalThis");
      expect(source).not.toContain('from "bun"');
      expect(source).not.toContain("process.platform");
      expect(source).not.toContain(" as BunServe");
    }
  });

  test("Nitro close hooks stop shared messaging workers exactly once in both layouts", async () => {
    for (const mode of ["monorepo", "single"] as const) {
      Reflect.deleteProperty(globalThis, "__ghostinitMessagingOutboxWorker");
      Reflect.deleteProperty(globalThis, "__ghostinitStorageCleanup");
      let stopCalls = 0;
      let abortCalls = 0;
      let closeHook: NitroCloseHook | undefined;
      const root = mode === "monorepo" ? "apps/web/" : "";
      const source = fileContent(
        generateProjectFiles(config(mode, "tanstack-start", "postgres")),
        `${root}server/plugins/messaging-outbox.ts`,
      );
      const plugin = loadMessagingOutboxPlugin(
        source,
        () => ({
          async stop() {
            stopCalls += 1;
          },
        }),
        (signal) =>
          new Promise<void>((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                abortCalls += 1;
                resolve();
              },
              { once: true },
            );
          }),
      );
      plugin({
        hooks: {
          hook(name, callback) {
            expect(name).toBe("close");
            closeHook = callback;
          },
        },
      });
      if (!closeHook) throw new Error(`${mode}: Nitro close hook was not registered`);
      await closeHook();
      await closeHook();
      expect(stopCalls, mode).toBe(1);
      expect(abortCalls, mode).toBe(1);
      expect(Reflect.get(globalThis, "__ghostinitMessagingOutboxWorker"), mode).toBeUndefined();
      expect(Reflect.get(globalThis, "__ghostinitStorageCleanup"), mode).toBeUndefined();
    }
  });

  test("Postgres exports constrained messaging tables and opaque pending attachments", () => {
    const files = generateProjectFiles(config("monorepo", "nextjs", "postgres"));
    const schemaIndex = fileContent(files, "packages/database/src/schema/index.ts");
    const attachments = fileContent(
      files,
      "packages/database/src/schema/tables/message_attachments.ts",
    );
    const upload = fileContent(files, "apps/web/src/app/api/messaging/attachments/route.ts");
    const adapter = fileContent(files, "apps/web/src/server/messaging/attachment-storage.ts");
    const download = fileContent(
      files,
      "apps/web/src/app/api/messaging/attachments/[attachmentId]/route.ts",
    );

    expect(schemaIndex).toContain('export * from "./messaging";');
    expect(attachments).toContain("ownerId:");
    expect(attachments).toContain("conversationId:");
    expect(attachments).toContain("messageId:");
    expect(attachments).toContain("expiresAt:");
    expect(adapter).toContain("const attachmentId = randomUUID()");
    expect(upload).toContain("return NextResponse.json({ attachmentId: stored.attachmentId }");
    expect(upload).not.toContain("attachmentId: stored.storageKey");
    expect(download).toContain(".innerJoin(");
    expect(download).toContain("eq(conversationParticipants.userId, user.id)");
    expect(download.indexOf(".innerJoin(")).toBeLessThan(
      download.indexOf("getFile(authorized.storageKey)"),
    );
    expect(download.indexOf("eq(conversationParticipants.userId, user.id)")).toBeLessThan(
      download.indexOf("getFile(authorized.storageKey)"),
    );
    expect(download).not.toContain('searchParams.get("key")');
  });

  test("Postgres durably sweeps expired pending attachments in both layouts", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateProjectFiles(config(mode, "nextjs", "postgres"));
      const attachmentPath =
        mode === "monorepo"
          ? "packages/database/src/schema/tables/message_attachments.ts"
          : "src/server/db/schema/messaging.ts";
      const workerPath =
        mode === "monorepo"
          ? "packages/api/src/workers/storage/cleanup.ts"
          : "src/server/workers/storage/cleanup.ts";
      const storageSchemaPath =
        mode === "monorepo"
          ? "packages/database/src/schema/storage.ts"
          : "src/server/db/schema/storage.ts";
      const attachmentFile = fileContent(files, attachmentPath);
      const attachmentStart = attachmentFile.indexOf("export const messageAttachments");
      const attachmentEnd = attachmentFile.indexOf("\nexport const ", attachmentStart + 1);
      const attachmentSchema = attachmentFile.slice(
        attachmentStart,
        attachmentEnd === -1 ? undefined : attachmentEnd,
      );
      const worker = fileContent(files, workerPath);
      const storageSchema = fileContent(files, storageSchemaPath);
      const rootPackage = JSON.parse(fileContent(files, "package.json")) as {
        scripts?: Record<string, string>;
      };

      expect(attachmentSchema.match(/onDelete: "restrict"/g)).toHaveLength(3);
      expect(attachmentSchema).not.toContain('onDelete: "cascade"');
      expect(attachmentSchema).toContain("message_attachments_expired_pending_idx");
      expect(attachmentSchema).toContain('uploadedAt: timestamp("uploaded_at")');
      expect(attachmentSchema).toContain(".on(table.expiresAt, table.id)");
      expect(attachmentSchema).toContain(".where(sql`${table.messageId} is null`)");
      expect(storageSchema).toContain('"storage_blob_cleanup_queue"');
      expect(storageSchema).toContain("storage_blob_cleanup_lease_pair_chk");
      expect(worker).toContain('.for("update", { skipLocked: true })');
      expect(worker).toContain("isNull(messageAttachments.messageId)");
      expect(worker.indexOf(".delete(messageAttachments)")).toBeLessThan(
        worker.indexOf(".insert(storageBlobCleanupQueue)"),
      );
      expect(worker).toContain("tombstones.length !== removed.length");
      expect(worker).toContain("ownerId: messageAttachments.ownerId");
      expect(worker).toContain("byteSize: messageAttachments.byteSize");
      expect(rootPackage.scripts?.["storage:cleanup-worker"]).toContain(workerPath);
    }
  });

  test("Convex uses mapped actors, participant guards, and internal privileged writes", () => {
    const files = generateProjectFiles(config("monorepo", "tanstack-start", "convex"));
    const boundary = fileContent(files, "convex/messaging.ts");
    const internalWrites = fileContent(files, "convex/messagingInternal.ts");
    const serverBridge = fileContent(files, "convex/messagingServer.ts");
    const uploadRoute = fileContent(files, "apps/web/src/routes/api/messaging/attachments.ts");
    const uploadHandler = fileContent(
      files,
      "apps/web/src/server/http/messaging/attachments-upload.server.ts",
    );
    const schema = fileContent(files, "convex/schema.ts");

    expect(boundary).toContain('import { isUserBanned, requireActor } from "./lib/auth"');
    expect(boundary.match(/await requireParticipant\(/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(boundary).toContain("args: { peerUserId: v.string() }");
    expect(boundary).toContain('ctx.db.normalizeId("users", args.peerUserId)');
    expect(boundary).not.toContain("getAuthUserId");
    expect(boundary).not.toContain("generateUploadUrl");
    expect(boundary).not.toContain("registerAttachment");
    expect(serverBridge).toContain("new Blob([args.bytes], { type: managedContentType })");
    expect(serverBridge).toContain("internal.storageInternal.reserveManagedBlob");
    expect(serverBridge).toContain("{ sha256: expectedSha256 }");
    expect(serverBridge).toContain("internal.messagingInternal.commitAttachmentUpload");
    expect(serverBridge).toContain("internal.messagingInternal.abortAttachmentUpload");
    expect(uploadRoute).toContain('import { createServerOnlyFn } from "@tanstack/react-start"');
    expect(uploadRoute).toContain("const dispatchAttachmentUpload = createServerOnlyFn(");
    expect(uploadRoute).toContain("await import(");
    expect(uploadRoute).toContain('"@/server/http/messaging/attachments-upload.server"');
    expect(uploadRoute).toContain("return await uploadConvexAttachment(request)");
    expect(uploadRoute).toContain("POST: ({ request }");
    expect(uploadRoute).toContain("dispatchAttachmentUpload(request)");
    expect(uploadRoute).not.toContain("api.messagingServer");
    expect(uploadHandler).toContain("api.messagingServer.authorizeUpload");
    expect(uploadHandler).toContain("api.messagingServer.upload");
    expect(uploadHandler.indexOf("api.messagingServer.authorizeUpload")).toBeLessThan(
      uploadHandler.indexOf("readBoundedMultipartFormData(request)"),
    );
    expect(uploadHandler).toContain('request.headers.get("x-ghostinit-conversation-id")');
    expect(uploadHandler).not.toContain("generateUploadUrl");
    expect(internalWrites.match(/internalMutation\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(internalWrites).toContain("ATTACHMENT_FORBIDDEN");
    expect(schema).toContain("messageAttachments: defineTable");
    expect(schema).toContain('v.array(v.id("messageAttachments"))');
  });

  test("declares the S3 SDK and application-owned messaging/storage ports", () => {
    const monorepo = generateProjectFiles(config("monorepo", "nextjs", "postgres"));
    const single = generateProjectFiles(config("single", "nextjs", "postgres"));
    const storagePackage = JSON.parse(fileContent(monorepo, "packages/storage/package.json")) as {
      dependencies?: Record<string, string>;
    };
    const singlePackage = JSON.parse(fileContent(single, "package.json")) as {
      dependencies?: Record<string, string>;
    };

    expect(storagePackage.dependencies?.["@aws-sdk/client-s3"]).toBeTruthy();
    expect(singlePackage.dependencies?.["@aws-sdk/client-s3"]).toBeTruthy();
    expect(fileContent(monorepo, "packages/services/src/messaging/ports.ts")).toContain(
      "MessagingRepositoryPort",
    );
    expect(fileContent(monorepo, "packages/services/src/storage/ports.ts")).toContain(
      "resolveAuthorized(attachmentId: string, userId: string)",
    );
    expect(fileContent(single, "src/server/services/messaging/ports.ts")).toContain(
      "MessagingRealtimePort",
    );
    for (const [files, path] of [
      [monorepo, "packages/api/src/adapters/storage/postgres.ts"],
      [single, "src/server/adapters/storage/postgres.ts"],
    ] as const) {
      const quotaAdapter = fileContent(files, path);
      expect(quotaAdapter, path).toContain("messageAttachments");
      expect(quotaAdapter, path).toContain("...messageAttachmentUsage");
      expect(quotaAdapter, path).toContain("sql`select pg_advisory_xact_lock");
    }
  });

  test("websocket handshakes reject cross-site origins and expose one typed oRPC endpoint", () => {
    expect(
      isTrustedWebSocketOrigin("https://app.example.com/socket", [
        "https://app.example.com/dashboard",
      ]),
    ).toBe(true);
    expect(isTrustedWebSocketOrigin("https://evil.example.com", ["https://app.example.com"])).toBe(
      false,
    );
    expect(
      isTrustedWebSocketOrigin("https://app.example.com.evil.test", ["https://app.example.com"]),
    ).toBe(false);
    expect(isTrustedWebSocketOrigin(null, ["https://app.example.com"])).toBe(false);
    expect(isTrustedWebSocketOrigin("not a URL", ["https://app.example.com"])).toBe(false);

    const nextFiles = generateProjectFiles(config("monorepo", "nextjs", "postgres"));
    const customServer = fileContent(nextFiles, "apps/web/server.ts");
    const nextRoute = fileContent(nextFiles, "apps/web/src/app/api/ws/route.ts");
    const nextAuth = fileContent(nextFiles, "apps/web/src/server/transport/websocket-auth.ts");
    const nextClient = fileContent(nextFiles, "apps/web/src/lib/realtime.ts");
    const nextSubscription = fileContent(
      nextFiles,
      "packages/api/src/procedures/messaging/subscribe.ts",
    );
    const realtimeBroker = fileContent(nextFiles, "packages/realtime/src/index.ts");
    expect(customServer).toContain("function toWebHeaders(input: IncomingHttpHeaders): Headers");
    expect(customServer).toContain('from "./src/server/transport/websocket-auth"');
    expect(customServer).toContain('import("@orpc/server/websocket")');
    expect(customServer).not.toContain('import("@orpc/server/ws")');
    expect(customServer.indexOf("if (!trustedWebSocketOrigin(headers))")).toBeLessThan(
      customServer.indexOf("webSocketServer.handleUpgrade"),
    );
    expect(customServer).toContain('url.pathname !== "/api/ws"');
    expect(customServer).not.toContain("/api/realtime");
    expect(customServer).not.toContain("RealtimeControl");
    expect(customServer).not.toContain("registerRealtimeSocket");
    expect(customServer).toContain("await rpcHandler.message(socket, message,");
    expect(customServer).toContain("const current = await currentIdentity(headers, expected)");
    expect(customServer).toContain("maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES");
    expect(customServer).toContain("const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024");
    expect(customServer).toContain("const MAX_RPC_QUEUE_MESSAGES = 32");
    expect(customServer).toContain("const MAX_RPC_QUEUE_BYTES = 256 * 1024");
    expect(customServer).toContain("acquireWebSocketSlot(expected.userId)");
    expect(customServer).toContain("const messagingOutbox = startMessagingOutboxWorker()");
    expect(customServer).toContain("messagingOutbox.stop()");
    expect(customServer).toContain("runPostgresStorageCleanupWorker(storageCleanupAbort.signal)");
    expect(customServer).toContain("storageCleanupAbort.abort()");
    expect(customServer).toContain("storageCleanupTask");
    expect(customServer).not.toContain("registerWsClient(webSocket");
    expect(nextAuth).toContain("MAX_WEBSOCKET_CONNECTIONS = 512");
    expect(nextAuth).toContain("MAX_WEBSOCKETS_PER_USER = 8");
    expect(nextAuth).toContain("query: { disableCookieCache: true, disableRefresh: true }");
    expect(nextAuth).toContain("expected.sessionId !== sessionId");
    expect(nextAuth).toContain("context.user.banned === true");
    expect(nextRoute).toContain("trustedWebSocketOrigin(request.headers)");
    expect(nextRoute).toContain('from "@/server/transport/websocket-auth"');
    expect(nextClient).toContain("createORPCClient(new RPCLink({ websocket: socket }))");
    expect(nextClient).toContain("messagingClient.messaging.subscribe(");
    expect(nextClient).toContain("for await (const event of iterator)");
    expect(nextClient).toContain("type MessagingRealtimeEvent");
    expect(nextClient.match(/new WebSocket\(/g)).toHaveLength(1);
    expect(nextClient).not.toContain("/api/realtime");
    expect(nextClient).not.toContain("sendRealtimeControl");
    expect(nextClient).not.toContain(".send(JSON.stringify");
    expect(nextClient).not.toContain('.addEventListener("message"');
    expect(nextClient).not.toContain("JSON.parse");
    expect(nextSubscription).toContain('import { eventIterator, oc } from "@orpc/contract"');
    expect(nextSubscription).toContain('z.discriminatedUnion("type"');
    expect(nextSubscription).toContain(".output(eventIterator(messagingRealtimeEventSchema))");
    expect(nextSubscription).toContain("subscribeToMessagingEvents(");
    expect(nextSubscription).toContain("new EventPublisher<{ event: MessagingStreamEvent }>");
    expect(realtimeBroker).toContain('type: "message";');
    expect(realtimeBroker).not.toContain("registerWsClient");
    expect(realtimeBroker).not.toContain("subscribeWsClient");

    const tanstackFiles = generateProjectFiles(config("monorepo", "tanstack-start", "postgres"));
    const tanstackRpc = fileContent(tanstackFiles, "apps/web/server/websocket-handler.ts");
    const tanstackRoute = fileContent(tanstackFiles, "apps/web/server/routes/api/ws.ts");
    const tanstackOutbox = fileContent(
      tanstackFiles,
      "apps/web/server/plugins/messaging-outbox.ts",
    );
    const tanstackWebSocketCompat = fileContent(
      tanstackFiles,
      "apps/web/server/plugins/00-nitro-websocket-compat.ts",
    );
    const tanstackAuth = fileContent(tanstackFiles, "apps/web/server/transport/websocket-auth.ts");
    const nitro = fileContent(tanstackFiles, "apps/web/nitro.config.ts");
    const tanstackPackage = JSON.parse(fileContent(tanstackFiles, "apps/web/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(realtime.crossws).toMatch(/^0\.4\./);
    expect(tanstackPackage.dependencies?.crossws).toContain(realtime.crossws);
    expect(tanstackFiles.some((file) => file.path === "apps/web/src/routes/api/ws.ts")).toBe(false);
    expect(tanstackFiles.some((file) => file.path.includes("/api/realtime"))).toBe(false);
    expect(tanstackRpc).toContain("defineWebSocketHandler");
    expect(tanstackRpc).toContain('from "./transport/websocket-auth"');
    expect(tanstackRpc).toContain("await handler.message(peer, message");
    expect(tanstackRpc).toContain("MAX_RPC_QUEUE_MESSAGES = 32");
    expect(tanstackRpc).toContain("acquireWebSocketSlot(expected.userId)");
    expect(tanstackRpc).toContain("handler.close(peer)");
    expect(tanstackRpc).toContain("...request.context");
    expect(tanstackRpc).not.toContain("request.context ?? {}");
    expect(tanstackRpc).toContain("websocketIdentity: {");
    expect(tanstackRpc).not.toContain("request.context.websocketIdentity =");
    expect(tanstackRpc).not.toContain("WebSocket context unavailable");
    expect(tanstackRpc).not.toContain('from "drizzle-orm"');
    expect(tanstackRpc).not.toContain("conversationParticipants");
    expect(tanstackRpc).not.toContain("RealtimeControl");
    expect(tanstackRoute).toContain('export { default } from "../../websocket-handler"');
    expect(tanstackOutbox).toContain('import { definePlugin } from "nitro"');
    expect(tanstackOutbox).toContain("startMessagingOutboxWorker()");
    expect(tanstackOutbox).toContain("runPostgresStorageCleanupWorker(controller.signal)");
    expect(tanstackOutbox).toContain("cleanup.controller.abort()");
    expect(tanstackOutbox).toContain('nitroApp.hooks.hook("close"');
    expect(tanstackOutbox).toContain("let stopped = false");
    expect(tanstackOutbox).toContain("if (stopped) return");
    expect(tanstackOutbox).toContain("stopped = true");
    expect(tanstackOutbox).toContain("await worker.stop()");
    expect(tanstackWebSocketCompat).toContain("Nitro 3 beta resolves websocket hooks");
    expect(tanstackWebSocketCompat).toContain("@orpc/server/crossws owns");
    expect(tanstackWebSocketCompat).toContain('import { definePlugin } from "nitro"');
    expect(tanstackWebSocketCompat).toContain(
      'import type { Hooks as CrosswsHooks } from "crossws"',
    );
    expect(tanstackWebSocketCompat).toContain('requestPathname(request) !== "/api/ws"');
    expect(tanstackWebSocketCompat).toContain("rejectionHooks(404)");
    expect(tanstackWebSocketCompat).toContain("rejectionHooks(503)");
    expect(tanstackWebSocketCompat).toContain('new Response("WebSocket service unavailable"');
    expect(tanstackWebSocketCompat).toContain(
      "const originalFetch = nitroApp.fetch.bind(nitroApp)",
    );
    expect(tanstackWebSocketCompat).toContain('Reflect.get(response, "crossws")');
    expect(tanstackWebSocketCompat).toContain("if (!isWebSocketUpgrade(request))");
    expect(tanstackWebSocketCompat).not.toContain("new WeakMap<Request");
    expect(tanstackWebSocketCompat).not.toContain("requestFromHookArgument");
    expect(tanstackWebSocketCompat).not.toContain("resolvedHooks");
    expect(tanstackWebSocketCompat).not.toContain("runtimeFetch");
    expect(tanstackWebSocketCompat).not.toContain("h3App");
    expect(tanstackWebSocketCompat).not.toContain("._h3");
    expect(tanstackWebSocketCompat).toContain('Reflect.get(globalThis, "Bun")');
    expect(tanstackWebSocketCompat).toContain(
      "Reflect.apply(originalServe, bunRuntime, [options])",
    );
    expect(tanstackWebSocketCompat).not.toContain("globalThis as typeof globalThis");
    expect(tanstackWebSocketCompat).not.toContain(".bind(bunRuntime) as BunServe");
    expect(tanstackWebSocketCompat).toContain("bunRuntime.serve = patchedServe");
    expect(tanstackWebSocketCompat).toContain("maxPayloadLength: MAX_WEBSOCKET_PAYLOAD_BYTES");
    expect(tanstackAuth).toContain("query: { disableCookieCache: true, disableRefresh: true }");
    expect(nitro).toContain("experimental: { websocket: true }");
    expect(nitro).toContain("serverDir: 'server'");
    expect(nitro).toContain("'./server/plugins/00-nitro-websocket-compat.ts'");
    expect(nitro).toContain("'./server/plugins/messaging-outbox.ts'");
    expect(tanstackRpc).not.toContain("status: 101");
    expect(tanstackFiles.some((file) => file.path.includes("/routes/hooks/"))).toBe(false);
    expect(
      fileContent(tanstackFiles, "apps/web/src/features/messaging/use-messaging-workspace.ts"),
    ).toContain("useMessagingWorkspace");
    expect(fileContent(tanstackFiles, "apps/web/src/features/messaging/queries.ts")).toContain(
      "useQuery",
    );

    const singleNextFiles = generateProjectFiles(config("single", "nextjs", "postgres"));
    expect(fileContent(singleNextFiles, "src/server/transport/websocket-auth.ts")).toContain(
      'from "@/server/api"',
    );
    expect(fileContent(singleNextFiles, "src/app/api/ws/route.ts")).toContain(
      'from "@/server/transport/websocket-auth"',
    );
    expect(fileContent(singleNextFiles, "next-server.ts")).toContain(
      'from "./src/server/transport/websocket-auth"',
    );

    const singleTanstackFiles = generateProjectFiles(
      config("single", "tanstack-start", "postgres"),
    );
    expect(fileContent(singleTanstackFiles, "server/transport/websocket-auth.ts")).toContain(
      'from "@/server/api"',
    );
    expect(fileContent(singleTanstackFiles, "server/websocket-handler.ts")).toContain(
      'from "./transport/websocket-auth"',
    );

    const nativeFiles = generateProjectFiles({
      ...config("monorepo", "nextjs", "postgres"),
      apps: ["web", "mobile", "desktop"],
    });
    expect(fileContent(nativeFiles, "apps/mobile/src/lib/realtime.ts")).toContain(
      "createWebsocketTicket",
    );
    expect(fileContent(nativeFiles, "apps/desktop/src/renderer/lib/realtime.ts")).toContain(
      "createWebsocketTicket",
    );
  });

  test("desktop Convex templates keep native reactivity in typed feature data adapters", () => {
    for (const mode of ["monorepo", "single"] as const) {
      // Single native templates retain alias-level coverage; public creation requires a web host.
      if (mode === "single") {
        const resolution = resolveCreateConfig({
          ...config(mode, "nextjs", "convex"),
          apps: ["desktop"],
          databaseWasExplicit: true,
          preset: "custom",
          cache: "none",
          deploy: "none",
          withMessaging: true,
        });
        expect(resolution.ok).toBe(false);
        if (resolution.ok) throw new Error("Single native messaging unexpectedly resolved");
        expect(resolution.reason).toBe("single-native-server-capabilities-unsupported");
        expect(resolution.unsupportedSelections).toContain("messaging");
      }
      const files = generateProjectFiles({
        ...config(mode, "nextjs", "convex"),
        apps: mode === "monorepo" ? ["web", "desktop"] : ["desktop"],
      });
      const root = mode === "monorepo" ? "apps/desktop/" : "";
      const desktopMessages = fileContent(files, `${root}src/renderer/routes/messages.tsx`);
      const adapter = fileContent(files, `${root}src/renderer/adapters/messaging/convex.ts`);
      const feature = `${root}src/renderer/features/messaging`;
      const queries = fileContent(files, `${feature}/queries.ts`);
      const mutations = fileContent(files, `${feature}/mutations.ts`);
      const model = fileContent(files, `${feature}/model.ts`);
      const screen = fileContent(files, `${feature}/screen.tsx`);
      const views = files.filter(({ path }) => path.startsWith(`${feature}/components/`));
      const desktopManifest = JSON.parse(
        fileContent(files, mode === "monorepo" ? "apps/desktop/package.json" : "package.json"),
      ) as { dependencies?: Record<string, string> };
      const alias = mode === "monorepo" ? "@" : "@/renderer";

      expect(desktopMessages).toContain(`from "${alias}/features/messaging/screen"`);
      expect(desktopMessages).not.toContain("convex/react");
      expect(desktopMessages).not.toContain("convex/_generated/api");
      expect(desktopMessages).not.toContain("api.messaging");
      expect(desktopMessages).not.toContain("._id");
      expect(desktopMessages).not.toContain("@/lib/orpc");
      expect(desktopMessages).not.toMatch(/from ["']\.\.\/\.\.\/\.\.\//);
      expect(desktopMessages).not.toMatch(/\bas\s+(?:any|never|unknown)\b/);
      for (const data of [queries, mutations]) {
        expect(data).toContain('from "convex/react"');
        expect(data).toContain(
          mode === "monorepo"
            ? 'from "../../../../../../convex/_generated/api"'
            : 'from "../../../../convex/_generated/api"',
        );
      }
      for (const operation of ["listConversations", "listMessages", "listTyping"]) {
        expect(queries).toContain(`api.messaging.${operation}`);
      }
      for (const operation of ["getOrCreateConversation", "sendMessage", "sendTyping"]) {
        expect(mutations).toContain(`api.messaging.${operation}`);
      }
      expect(model).toContain('import { z } from "zod"');
      expect(queries).toContain("conversationListSchema.parse(rawConversations)");
      expect(queries).toContain("messagePageSchema.parse(rawMessages)");
      expect(mutations).toContain(`from "${alias}/adapters/messaging/convex"`);
      for (const source of [adapter, queries, mutations, model, screen]) {
        expect(source).not.toContain("convex/server");
        expect(source).not.toContain("makeFunctionReference");
        expect(source).not.toMatch(/\bany\b/);
        expect(source).not.toMatch(/\bas\s+(?:any|never|unknown)\b/);
      }
      for (const source of [adapter, model, screen, ...views.map(({ content }) => content)]) {
        expect(source).not.toContain("convex/react");
        expect(source).not.toContain("api.messaging");
      }
      expect(desktopManifest.dependencies?.zod).toBeDefined();
      expect(desktopMessages).toContain('import { createFileRoute } from "@tanstack/react-router"');
      expect(desktopMessages).not.toContain("refetchInterval");
      expect(desktopMessages).not.toContain("stub pending");
      expect(desktopMessages).not.toContain("available in web build");
      expect(fileContent(files, `${feature}/components/messaging-thread-view.tsx`)).toContain(
        "text-start",
      );
      for (const { content } of views) expect(content).not.toContain("text-left");
    }
  });

  test("desktop Postgres messaging degrades to polling when native websocket tickets are unavailable", () => {
    const files = generateProjectFiles({
      ...config("monorepo", "nextjs", "postgres"),
      apps: ["web", "desktop"],
    });
    const desktopMessages = fileContent(files, "apps/desktop/src/renderer/routes/messages.tsx");
    const feature = "apps/desktop/src/renderer/features/messaging";
    const queries = fileContent(files, `${feature}/queries.ts`);
    expect(
      queries.match(/refetchInterval: transport === "polling" \? 5_000 : false/g),
    ).toHaveLength(2);
    expect(queries).toContain("subscribeRealtime(conversationId");
    expect(queries).toContain("connection.id === conversationId ? connection : null");
    expect(queries).toContain('activeConnection?.transport ?? "polling"');
    expect(queries).toContain('transport: connected ? "realtime" : "polling"');
    expect(queries).toContain("catch { status(false); }");
    expect(queries).toContain("const isCurrent = () => active && isOwner()");
    expect(queries).toContain("active = false; unsubscribe?.()");
    const workspace = fileContent(files, `${feature}/components/messaging-workspace-view.tsx`);
    expect(workspace).toContain("Realtime with polling fallback");
    expect(workspace).toContain("secure realtime connection is unavailable");
    expect(desktopMessages).not.toContain("@tanstack/react-query");
    expect(desktopMessages).not.toContain("@/lib/orpc");
    const thread = fileContent(files, `${feature}/components/messaging-thread-view.tsx`);
    expect(thread).toContain("text-start");
    expect(thread).not.toContain("text-left");
    expect(workspace).not.toContain("text-left");
  });

  test("web messaging emits policy-sized feature components with logical alignment", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generateProjectFiles(config("monorepo", framework, "postgres"));
      const route =
        framework === "nextjs"
          ? "apps/web/src/app/(app)/messages/page.tsx"
          : "apps/web/src/routes/messages.tsx";
      const feature = "apps/web/src/features/messaging";
      const paths = [
        route,
        `${feature}/page.tsx`,
        `${feature}/message-composer.tsx`,
        `${feature}/message-thread.tsx`,
        `${feature}/components/messaging-workspace-view.tsx`,
        `${feature}/components/message-composer-view.tsx`,
        `${feature}/components/message-list.tsx`,
        `${feature}/components/message-thread-view.tsx`,
      ];
      for (const path of paths) {
        const source = fileContent(files, path);
        expect(source.split(/\r?\n/).length, path).toBeLessThanOrEqual(150);
        expect(source, path).not.toContain("text-left");
      }
      expect(fileContent(files, `${feature}/components/messaging-workspace-view.tsx`)).toContain(
        "text-start",
      );
    }
  });

  test("attachment uploads reject declared, file, decoded, and stored oversize bodies", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generateProjectFiles(config("monorepo", framework, "postgres"));
      const path =
        framework === "nextjs"
          ? "apps/web/src/app/api/messaging/attachments/route.ts"
          : "apps/web/src/server/http/messaging/attachments-upload.server.ts";
      const downloadPath =
        framework === "nextjs"
          ? "apps/web/src/app/api/messaging/attachments/[attachmentId]/route.ts"
          : "apps/web/src/server/http/messaging/attachments-download.server.ts";
      const upload = fileContent(files, path);
      const download = fileContent(files, downloadPath);
      const adapter = fileContent(files, "apps/web/src/server/messaging/attachment-storage.ts");
      expect(upload).toContain("const MAX_ATTACHMENT_BYTES = DEFAULT_STORAGE_QUOTA.maxObjectBytes");
      expect(upload.indexOf("declaredBodyTooLarge(request)")).toBeLessThan(
        upload.indexOf("readBoundedMultipartFormData(request)"),
      );
      expect(
        upload.indexOf("authorizeMessageAttachmentUpload(conversationId, user.id)"),
      ).toBeLessThan(upload.indexOf("readBoundedMultipartFormData(request)"));
      expect(upload).toContain('request.headers.get("x-ghostinit-conversation-id")');
      expect(upload).toContain("MAX_CONCURRENT_UPLOADS = 2");
      expect(upload).toContain("UPLOAD_READ_DEADLINE_MS = 15_000");
      expect(upload).toContain("query: { disableCookieCache: true }");
      expect(upload).toContain('reader.cancel("multipart body limit exceeded")');
      expect(upload.indexOf("upload.size > MAX_ATTACHMENT_BYTES")).toBeLessThan(
        upload.indexOf("upload.arrayBuffer()"),
      );
      expect(upload.indexOf("bytes.byteLength > MAX_ATTACHMENT_BYTES")).toBeLessThan(
        upload.indexOf("storeMessageAttachment({"),
      );
      expect(adapter).toContain("const initialDecision = decideStorageQuota(");
      expect(adapter.indexOf("reserveMessageAttachment(input)")).toBeLessThan(
        adapter.indexOf("await putFile("),
      );
      expect(adapter).toContain("stored.byteSize !== reservation.byteSize");
      expect(adapter).toContain("db.transaction(async (transaction) =>");
      expect(adapter).toContain('source: "messaging-attachment-upload-cancel"');
      expect(upload.match(/status: 413/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
      expect(upload).not.toContain("getFile");
      expect(upload).not.toContain("contentDisposition");
      expect(download).not.toContain("isAllowedMime");
      expect(download).not.toContain("putFile");
      expect(download).not.toContain("randomUUID");
      expect(download).not.toContain("acquireUploadAdmission");
      expect(download).toContain("isNotNull(messageAttachments.uploadedAt)");
      expect(download).toContain("code <= 0x1f || code === 0x7f");
      expect(download).not.toContain("u0000");
    }
  });

  test("removes the spoofable legacy messaging application surface", () => {
    const files = generateProjectFiles(config("monorepo", "nextjs", "postgres"));
    const paths = new Set(files.map(({ path }) => path));
    const publicModule = fileContent(files, "packages/modules/src/messaging/index.ts");
    const publicDomain = fileContent(files, "packages/modules/src/messaging/domain/index.ts");

    for (const path of [
      "packages/modules/src/messaging/application/get-or-create-conversation.ts",
      "packages/modules/src/messaging/application/list-conversations.ts",
      "packages/modules/src/messaging/application/list-messages.ts",
      "packages/modules/src/messaging/application/send-message.ts",
      "packages/modules/src/messaging/application/mark-read.ts",
      "packages/modules/src/messaging/application/index.ts",
    ]) {
      expect(paths.has(path), path).toBe(false);
    }
    expect(publicModule).toContain('from "./domain/types"');
    expect(publicDomain).toContain('from "./types"');
    expect(`${publicModule}\n${publicDomain}`).not.toContain("./application");
    expect(files.map(({ content }) => content).join("\n")).not.toContain(
      "export interface ListMessagesInput { conversationId: string; userId?: string",
    );
    const modulesManifest = JSON.parse(fileContent(files, "packages/modules/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(modulesManifest.dependencies?.["@repo/database"]).toBeUndefined();
    expect(modulesManifest.dependencies?.["@repo/realtime"]).toBeUndefined();
    expect(modulesManifest.dependencies?.["drizzle-orm"]).toBeUndefined();

    const service = fileContent(files, "packages/services/src/messaging/facade.ts");
    expect(service).toContain("async function requireParticipant(actor: MessagingActor");
    expect(service).toContain("repository.isParticipant(conversationId, actor.id)");
    expect(service).toContain("senderId: actor.id");
  });
});
