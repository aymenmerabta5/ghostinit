// @allow-long 345: cross-target ticket generation and executable client/server probes share one fixture
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type GeneratedFile = { path: string; content: string };

function config(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  apps: Array<"web" | "mobile" | "desktop"> = ["web"],
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "realtime-native-ticket",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    apps,
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: [],
    features: [],
    messaging: true,
    storage: true,
    notifications: false,
    featureFlags: "none",
    jobs: false,
  } satisfies ProjectConfig);
}

function generate(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  apps?: Array<"web" | "mobile" | "desktop">,
): GeneratedFile[] {
  return generateProjectFiles(config(mode, framework, apps), { dryRun: true });
}

function read(files: readonly GeneratedFile[], path: string): string {
  const source = files.find((entry) => entry.path === path)?.content;
  if (source === undefined) throw new Error(`Missing generated file: ${path}`);
  return source;
}

function executableModule(source: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", ""),
  );
}

describe("ticket-authenticated realtime parity", () => {
  test("ordinary Next development runs the generated websocket server in both layouts", () => {
    const monorepo = generate("monorepo", "nextjs");
    const rootPackage = JSON.parse(read(monorepo, "package.json")) as {
      scripts: Record<string, string>;
    };
    const webPackage = JSON.parse(read(monorepo, "apps/web/package.json")) as {
      scripts: Record<string, string>;
    };
    expect(rootPackage.scripts.dev).toBe("turbo run dev");
    expect(webPackage.scripts.dev).toContain("server.ts");
    expect(webPackage.scripts.dev).not.toContain("next dev");
    expect(read(monorepo, "apps/web/src/app/api/ws/route.ts")).toContain(
      "Run bun run dev in development or bun run start in production",
    );

    const singlePackage = JSON.parse(read(generate("single", "nextjs"), "package.json")) as {
      scripts: Record<string, string>;
    };
    expect(singlePackage.scripts.dev).toContain("server.ts");
    expect(singlePackage.scripts.dev).not.toContain("next dev");

    const tanstackPackage = JSON.parse(
      read(generate("monorepo", "tanstack-start"), "apps/web/package.json"),
    ) as { scripts: Record<string, string> };
    expect(tanstackPackage.scripts.dev).not.toContain("server.ts");
  });

  test("Next and TanStack emit the same bounded, database-backed one-time ticket boundary", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      const files = generate("monorepo", framework);
      const authPath =
        framework === "nextjs"
          ? "apps/web/src/server/transport/websocket-auth.ts"
          : "apps/web/server/transport/websocket-auth.ts";
      const handlerPath =
        framework === "nextjs" ? "apps/web/server.ts" : "apps/web/server/websocket-handler.ts";
      const auth = read(files, authPath);
      const handler = read(files, handlerPath);
      const router = read(files, "packages/api/src/router.ts");
      const procedure = read(
        files,
        "packages/api/src/procedures/messaging/create-websocket-ticket.ts",
      );
      const schema = read(
        files,
        "packages/database/src/schema/tables/messaging_websocket_tickets.ts",
      );

      expect(procedure).toContain('randomBytes(32).toString("base64url")');
      expect(procedure).toContain('createHash("sha256")');
      expect(procedure).toContain('nativeClient !== "expo" && nativeClient !== "desktop"');
      expect(procedure).toContain("NATIVE_WEBSOCKET_TICKET_TTL_MS = 30_000");
      expect(procedure).toContain("onConflictDoUpdate");
      expect(schema).toContain("ticketHash: text");
      expect(schema).toContain("messaging_websocket_tickets_session_uidx");
      expect(auth).toContain(".delete(messagingWebsocketTickets)");
      expect(auth).toContain("WEBSOCKET_AUTHENTICATION_TIMEOUT_MS = 5_000");
      expect(auth).toContain("gt(sessions.expiresAt, now)");
      expect(auth).toContain("isNull(sessions.revokedAt)");
      expect(auth).toContain("lte(users.banExpires, now)");
      expect(handler).toContain("hasNativeWebSocketTicket");
      expect(handler).toContain("authenticated.authentication");
      expect(handler).toContain("messagingWebSocketRouter");
      expect(handler).not.toMatch(/(?:RPCHandler|experimental_RPCHandler)\(appRouter\)/);
      const ticketRouter = router.slice(router.indexOf("export const messagingWebSocketRouter"));
      expect(ticketRouter).toContain("sendTyping: messagingSendTyping");
      expect(ticketRouter).toContain("subscribe: messagingSubscribe");
      expect(ticketRouter).not.toContain("listConversations:");
      expect(ticketRouter).not.toContain("sendMessage:");
      expect(ticketRouter).not.toContain("createWebsocketTicket:");
      expect(auth).toContain("requestContext.application.principal");
      expect(auth).toContain("...requestContext");
    }
  });

  test("a generated native ticket is consumed once and its session is revalidated", async () => {
    const source = read(
      generate("monorepo", "nextjs"),
      "apps/web/src/server/transport/websocket-auth.ts",
    );
    let ticketAvailable = true;
    let sessionActive = true;
    const current = {
      sessionId: "session-1",
      userId: "user-1",
      email: "user@example.test",
      emailVerified: true,
      name: "User",
      role: "user",
    };
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => {
            if (!ticketAvailable) return [];
            ticketAvailable = false;
            return [{ userId: current.userId, sessionId: current.sessionId }];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => (sessionActive ? [current] : []) }),
          }),
        }),
      }),
    };
    const table = new Proxy<Record<string, string>>({}, { get: (_, key) => String(key) });
    const factory = new Function(
      "createHash",
      "and",
      "eq",
      "gt",
      "isNull",
      "lte",
      "or",
      "auth",
      "createContext",
      "env",
      "db",
      "messagingWebsocketTickets",
      "sessions",
      "users",
      `${executableModule(source)}; return { authenticateWebSocket, hasNativeWebSocketTicket };`,
    ) as (...args: unknown[]) => {
      authenticateWebSocket(headers: Headers, expected?: unknown): Promise<unknown>;
      hasNativeWebSocketTicket(headers: Headers): boolean;
    };
    const expression = (...values: unknown[]) => values;
    const runtime = factory(
      createHash,
      expression,
      expression,
      expression,
      expression,
      expression,
      expression,
      { api: { getSession: async () => null } },
      async (headers: Headers) => ({ headers, application: { principal: null } }),
      { BETTER_AUTH_URL: "https://app.example.test", SITE_URL: undefined },
      db,
      table,
      table,
      table,
    );
    const headers = new Headers({
      "sec-websocket-protocol": `ghostinit-ticket.${"a".repeat(43)}`,
    });
    expect(runtime.hasNativeWebSocketTicket(headers)).toBe(true);
    const first = (await runtime.authenticateWebSocket(headers)) as {
      authentication: string;
      sessionId: string;
    };
    expect(first.authentication).toBe("ticket");
    expect(first.sessionId).toBe("session-1");
    await expect(runtime.authenticateWebSocket(headers)).resolves.toBeNull();
    await expect(runtime.authenticateWebSocket(new Headers(), first)).resolves.not.toBeNull();
    sessionActive = false;
    await expect(runtime.authenticateWebSocket(new Headers(), first)).resolves.toBeNull();
    expect(
      runtime.hasNativeWebSocketTicket(
        new Headers({
          "sec-websocket-protocol": `ghostinit-ticket.${"a".repeat(43)}, ghostinit-ticket.${"b".repeat(43)}`,
        }),
      ),
    ).toBe(false);
  });

  for (const target of ["mobile", "desktop"] as const) {
    test(`${target} executes the generated typed ticket client and preserves polling fallback`, async () => {
      const files = generate("monorepo", "nextjs", ["web", target]);
      const path =
        target === "mobile"
          ? "apps/mobile/src/lib/realtime.ts"
          : "apps/desktop/src/renderer/lib/realtime.ts";
      const source = read(files, path);
      const sockets: Array<{ url: string; protocol: string }> = [];
      class FakeWebSocket {
        static readonly CONNECTING = 0;
        static readonly OPEN = 1;
        readonly readyState = FakeWebSocket.OPEN;
        private readonly closeListeners = new Set<() => void>();
        constructor(
          readonly url: string,
          readonly protocol: string,
        ) {
          sockets.push({ url, protocol });
        }
        addEventListener(name: string, listener: () => void): void {
          if (name === "close") this.closeListeners.add(listener);
        }
        close(): void {
          for (const listener of this.closeListeners) listener();
        }
      }
      class ProbeORPCError extends Error {
        constructor(readonly code: string) {
          super(code);
        }
      }
      const event = {
        type: "message" as const,
        conversationId: "conversation-1",
        messageId: "message-1",
        userId: "user-1",
        timestamp: Date.now(),
      };
      let ticketCalls = 0;
      const websocketClient = {
        messaging: {
          subscribe: async () =>
            (async function* events() {
              yield event;
            })(),
          sendTyping: async () => ({ ok: true }),
        },
      };
      const moduleFactory = new Function(
        "createORPCClient",
        "ORPCError",
        "RPCLink",
        "orpcClient",
        "env",
        "window",
        "WebSocket",
        `${executableModule(source)}; return { subscribeRealtime };`,
      ) as (...args: unknown[]) => {
        subscribeRealtime(
          conversationId: string,
          handler: (value: typeof event) => void,
          status: (connected: boolean) => void,
        ): () => void;
      };
      const runtime = moduleFactory(
        () => websocketClient,
        ProbeORPCError,
        class ProbeRPCLink {
          constructor(_input: unknown) {}
        },
        {
          messaging: {
            createWebsocketTicket: async () => {
              ticketCalls += 1;
              return { ticket: "t".repeat(43), expiresAt: new Date(Date.now() + 30_000) };
            },
          },
        },
        {
          EXPO_PUBLIC_API_URL: "https://api.example.test/base",
          EXPO_PUBLIC_APP_URL: undefined,
        },
        { desktopBridge: { apiUrl: "https://api.example.test/base" } },
        FakeWebSocket,
      );
      const statuses: boolean[] = [];
      let unsubscribe = () => undefined;
      const received = new Promise<typeof event>((resolve) => {
        unsubscribe = runtime.subscribeRealtime("conversation-1", resolve, (connected) => {
          statuses.push(connected);
        });
      });
      await expect(received).resolves.toEqual(event);
      unsubscribe();
      expect(ticketCalls).toBe(1);
      expect(sockets).toEqual([
        {
          url: "wss://api.example.test/api/ws",
          protocol: `ghostinit-ticket.${"t".repeat(43)}`,
        },
      ]);
      expect(statuses).toContain(false);
      expect(statuses).toContain(true);
      expect(source).toContain("MAX_NATIVE_REALTIME_SUBSCRIPTIONS = 32");
      expect(source).not.toContain("?ticket=");
      const adapterPath =
        target === "mobile"
          ? "apps/mobile/src/adapters/messaging/postgres.ts"
          : "apps/desktop/src/renderer/adapters/messaging/postgres.ts";
      expect(read(files, adapterPath)).toContain(
        'refetchInterval: transport === "polling" ? 5_000 : false',
      );
    });
  }

  test("single native output fails closed to polling instead of inventing a backend host", () => {
    for (const target of ["mobile", "desktop"] as const) {
      const files = generate("single", "nextjs", [target]);
      const path = target === "mobile" ? "src/lib/realtime.ts" : "src/renderer/lib/realtime.ts";
      const source = read(files, path);
      expect(source).toContain("Single native mode has no external backend host contract");
      expect(source).toContain("secure polling remains active");
      expect(source).not.toContain("new WebSocket(");
    }
  });
});
