type NativeRealtimeTarget = "expo" | "desktop";

function nativeBaseUrl(target: NativeRealtimeTarget): { importLine: string; expression: string } {
  return target === "expo"
    ? {
        importLine: 'import { env } from "@repo/config/expo";',
        expression: "env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL",
      }
    : {
        importLine: "",
        expression: "window.desktopBridge.apiUrl",
      };
}

/** A ticket-authenticated oRPC websocket client shared by hosted Expo and Electron apps. */
export function nativeRealtimeClientContent(target: NativeRealtimeTarget): string {
  const base = nativeBaseUrl(target);
  return `import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";
import { orpcClient } from "@/lib/orpc";
${base.importLine}

const NATIVE_WEBSOCKET_PROTOCOL_PREFIX = "ghostinit-ticket.";
const NATIVE_TICKET_DEADLINE_MS = 10_000;
const MAX_NATIVE_REALTIME_SUBSCRIPTIONS = 32;

type MessagingSubscription = Awaited<
  ReturnType<RouterClient<typeof appRouter>["messaging"]["subscribe"]>
>;
export type MessagingRealtimeEvent =
  MessagingSubscription extends AsyncIterator<infer Event> ? Event : never;

interface RealtimeListener {
  event: (event: MessagingRealtimeEvent) => void;
  status?: (connected: boolean) => void;
}

interface ConversationSubscription {
  conversationId: string;
  listeners: Set<RealtimeListener>;
  controller: AbortController;
  connected: boolean;
  task: Promise<void>;
}

const subscriptions = new Map<string, ConversationSubscription>();
let rpcSocket: WebSocket | null = null;
let rpcClient: RouterClient<typeof appRouter> | null = null;
let rpcClientPromise: Promise<RouterClient<typeof appRouter>> | null = null;

function configuredApiUrl(): string {
  const configured = ${base.expression};
  if (!configured) throw new Error("Configure the native API URL before using realtime messaging");
  return configured;
}

function websocketUrl(): string {
  let url: URL;
  try {
    url = new URL(configuredApiUrl());
  } catch (cause) {
    throw new Error("Native realtime requires a valid HTTP(S) API URL", { cause });
  }
  if (url.username || url.password || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("Native realtime requires a trusted HTTP(S) API URL");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function notifyStatus(state: ConversationSubscription, connected: boolean): void {
  if (state.connected === connected) return;
  state.connected = connected;
  for (const listener of state.listeners) listener.status?.(connected);
}

function clearRpcClient(socket?: WebSocket): void {
  if (socket && socket !== rpcSocket) return;
  rpcSocket = null;
  rpcClient = null;
  for (const state of subscriptions.values()) notifyStatus(state, false);
}

function closeRpcClient(socket?: WebSocket): void {
  const targetSocket = socket ?? rpcSocket;
  clearRpcClient(targetSocket ?? undefined);
  targetSocket?.close();
}

async function requestWebSocketTicket(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NATIVE_TICKET_DEADLINE_MS);
  try {
    const issued = await orpcClient.messaging.createWebsocketTicket(
      {},
      { signal: controller.signal },
    );
    if (issued.expiresAt.getTime() <= Date.now()) {
      throw new Error("The native WebSocket ticket expired before use");
    }
    return issued.ticket;
  } finally {
    clearTimeout(timer);
  }
}

export async function getMessagingClient(): Promise<RouterClient<typeof appRouter>> {
  if (
    rpcClient &&
    rpcSocket &&
    (rpcSocket.readyState === WebSocket.OPEN || rpcSocket.readyState === WebSocket.CONNECTING)
  ) {
    return rpcClient;
  }
  if (rpcClientPromise) return await rpcClientPromise;
  const pending = (async () => {
    closeRpcClient();
    const ticket = await requestWebSocketTicket();
    const socket = new WebSocket(
      websocketUrl(),
      NATIVE_WEBSOCKET_PROTOCOL_PREFIX + ticket,
    );
    const client = createORPCClient<RouterClient<typeof appRouter>>(
      new RPCLink({ websocket: socket }),
    );
    rpcSocket = socket;
    rpcClient = client;
    socket.addEventListener("close", () => clearRpcClient(socket));
    return client;
  })();
  rpcClientPromise = pending;
  try {
    return await pending;
  } finally {
    if (rpcClientPromise === pending) rpcClientPromise = null;
  }
}

function waitBeforeReconnect(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function consumeSubscription(state: ConversationSubscription): Promise<void> {
  let reconnectDelayMs = 1_000;
  while (!state.controller.signal.aborted && subscriptions.get(state.conversationId) === state) {
    let attemptedSocket: WebSocket | null = null;
    try {
      const client = await getMessagingClient();
      attemptedSocket = rpcSocket;
      const iterator = await client.messaging.subscribe(
        { conversationId: state.conversationId },
        { signal: state.controller.signal },
      );
      reconnectDelayMs = 1_000;
      notifyStatus(state, true);
      for await (const event of iterator) {
        if (state.controller.signal.aborted) return;
        for (const listener of state.listeners) {
          try {
            listener.event(event);
          } catch {
            // Presentation listeners are isolated from the shared typed stream.
          }
        }
      }
    } catch (error) {
      notifyStatus(state, false);
      if (state.controller.signal.aborted) return;
      if (
        error instanceof ORPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      ) {
        subscriptions.delete(state.conversationId);
        state.controller.abort();
        return;
      }
      closeRpcClient(attemptedSocket ?? undefined);
    }
    const delay = reconnectDelayMs + Math.floor(Math.random() * 250);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
    await waitBeforeReconnect(state.controller.signal, delay);
  }
}

export function subscribeRealtime(
  conversationId: string,
  handler: (event: MessagingRealtimeEvent) => void,
  onTransportChange?: (connected: boolean) => void,
): () => void {
  if (!conversationId || conversationId.length > 128 || conversationId.trim() !== conversationId) {
    throw new Error("A valid realtime conversation ID is required");
  }
  let state = subscriptions.get(conversationId);
  if (!state) {
    if (subscriptions.size >= MAX_NATIVE_REALTIME_SUBSCRIPTIONS) {
      throw new Error("Native realtime subscription limit reached");
    }
    const controller = new AbortController();
    state = {
      conversationId,
      listeners: new Set(),
      controller,
      connected: false,
      task: Promise.resolve(),
    };
    subscriptions.set(conversationId, state);
    state.task = consumeSubscription(state);
  }
  const activeState = state;
  const listener: RealtimeListener = { event: handler, status: onTransportChange };
  activeState.listeners.add(listener);
  onTransportChange?.(activeState.connected);
  return () => {
    activeState.listeners.delete(listener);
    if (activeState.listeners.size !== 0) return;
    if (subscriptions.get(conversationId) === activeState) subscriptions.delete(conversationId);
    activeState.controller.abort();
    notifyStatus(activeState, false);
    if (subscriptions.size === 0) closeRpcClient();
  };
}

export function sendTypingRealtime(conversationId: string, isTyping: boolean): void {
  void getMessagingClient()
    .then(async (client) => {
      await client.messaging.sendTyping({ conversationId, isTyping });
    })
    .catch(() => closeRpcClient());
}
`;
}

/** Single native mode intentionally has no generated backend host contract. */
export function unsupportedNativeRealtimeClientContent(target: NativeRealtimeTarget): string {
  const label = target === "desktop" ? "Packaged desktop" : "Expo";
  return `import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@/server/api";

const NATIVE_REALTIME_AUTH_ERROR =
  "${label} realtime requires a hosted monorepo web backend that can issue and consume one-time WebSocket tickets. " +
  "Single native mode has no external backend host contract; secure polling remains active.";

export type MessagingRealtimeEvent =
  | { readonly type: "message"; readonly conversationId: string }
  | { readonly type: "typing"; readonly conversationId: string; readonly isTyping: boolean; readonly userId: string };

export async function getMessagingClient(): Promise<RouterClient<typeof appRouter>> {
  throw new Error(NATIVE_REALTIME_AUTH_ERROR);
}

export function subscribeRealtime(
  _conversationId: string,
  _handler: (event: MessagingRealtimeEvent) => void,
  onTransportChange?: (connected: boolean) => void,
): () => void {
  onTransportChange?.(false);
  throw new Error(NATIVE_REALTIME_AUTH_ERROR);
}

export function sendTypingRealtime(_conversationId: string, _isTyping: boolean): void {
  // Single native mode intentionally remains on authenticated HTTP polling.
}
`;
}
