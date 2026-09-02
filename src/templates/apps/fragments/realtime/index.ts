import { nativeRealtimeClientContent, unsupportedNativeRealtimeClientContent } from "./native.js";

function realtimeBrowserClientContent(configImport: string, environmentExpression: string): string {
  return `"use client";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";
import { env } from "${configImport}";

let rpcSocket: WebSocket | null = null;
let client: RouterClient<typeof appRouter> | null = null;

type MessagingSubscription = Awaited<
  ReturnType<RouterClient<typeof appRouter>["messaging"]["subscribe"]>
>;
export type MessagingRealtimeEvent =
  MessagingSubscription extends AsyncIterator<infer Event> ? Event : never;

interface ConversationSubscription {
  conversationId: string;
  listeners: Set<(event: MessagingRealtimeEvent) => void>;
  controller: AbortController;
  task: Promise<void>;
}

const subscriptions = new Map<string, ConversationSubscription>();

function configuredWebSocketUrl(): string | undefined {
  return ${environmentExpression};
}

function websocketUrl(): string {
  const configured = configuredWebSocketUrl();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      throw new Error("The configured WebSocket URL must use ws:// or wss://");
    }
    return url.toString();
  }
  if (typeof window !== "undefined") {
    const url = new URL("/api/ws", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }
  return "ws://localhost:3000/api/ws";
}

function waitBeforeReconnect(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function clearRpcClient(socket?: WebSocket): void {
  if (socket && rpcSocket !== socket) return;
  rpcSocket = null;
  client = null;
}

export function getMessagingClient(): RouterClient<typeof appRouter> {
  if (typeof window === "undefined") throw new Error("getMessagingClient only in browser");
  if (
    client &&
    rpcSocket &&
    (rpcSocket.readyState === WebSocket.OPEN || rpcSocket.readyState === WebSocket.CONNECTING)
  ) {
    return client;
  }
  rpcSocket?.close();
  const socket = new WebSocket(websocketUrl());
  rpcSocket = socket;
  socket.addEventListener("close", () => {
    clearRpcClient(socket);
  });
  client = createORPCClient(new RPCLink({ websocket: socket }));
  return client;
}

async function consumeSubscription(state: ConversationSubscription): Promise<void> {
  let reconnectDelayMs = 1000;
  while (!state.controller.signal.aborted && subscriptions.get(state.conversationId) === state) {
    let attemptedSocket: WebSocket | null = null;
    try {
      const messagingClient = getMessagingClient();
      attemptedSocket = rpcSocket;
      const iterator = await messagingClient.messaging.subscribe(
        { conversationId: state.conversationId },
        { signal: state.controller.signal },
      );
      reconnectDelayMs = 1000;
      for await (const event of iterator) {
        if (state.controller.signal.aborted) return;
        for (const listener of state.listeners) {
          try {
            listener(event);
          } catch {
            // One presentation listener must not terminate the shared typed stream.
          }
        }
      }
    } catch (error) {
      if (state.controller.signal.aborted) return;
      if (
        error instanceof ORPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      ) {
        if (subscriptions.get(state.conversationId) === state) {
          subscriptions.delete(state.conversationId);
        }
        state.controller.abort();
        return;
      }
      attemptedSocket?.close();
      if (attemptedSocket) clearRpcClient(attemptedSocket);
    }
    const delay = reconnectDelayMs + Math.floor(Math.random() * 250);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
    await waitBeforeReconnect(state.controller.signal, delay);
  }
}

export function subscribeRealtime(
  conversationId: string,
  handler: (event: MessagingRealtimeEvent) => void,
): () => void {
  if (
    !conversationId ||
    conversationId.length > 128 ||
    conversationId.trim() !== conversationId
  ) {
    throw new Error("A valid realtime conversation ID is required");
  }
  let state = subscriptions.get(conversationId);
  if (!state) {
    const controller = new AbortController();
    state = {
      conversationId,
      listeners: new Set(),
      controller,
      task: Promise.resolve(),
    };
    subscriptions.set(conversationId, state);
    state.task = consumeSubscription(state).finally(() => {
      if (subscriptions.get(conversationId) === state && state?.listeners.size === 0) {
        subscriptions.delete(conversationId);
      }
    });
  }
  const activeState = state;
  activeState.listeners.add(handler);
  return () => {
    activeState.listeners.delete(handler);
    if (activeState.listeners.size !== 0) return;
    if (subscriptions.get(conversationId) === activeState) subscriptions.delete(conversationId);
    activeState.controller.abort();
  };
}

export function sendTypingRealtime(conversationId: string, isTyping: boolean): void {
  try {
    const messagingClient = getMessagingClient();
    const attemptedSocket = rpcSocket;
    void messagingClient.messaging.sendTyping({ conversationId, isTyping }).catch(() => {
      attemptedSocket?.close();
      if (attemptedSocket) clearRpcClient(attemptedSocket);
    });
  } catch {
    // The next user action will reconnect the RPC socket.
  }
}
`;
}

export function realtimeNextClientContent(): string {
  return realtimeBrowserClientContent("@repo/config/next", "env.NEXT_PUBLIC_WS_URL");
}

export function realtimeTanstackClientContent(): string {
  return realtimeBrowserClientContent("@repo/config/vite", "env.VITE_WS_URL");
}

export function realtimeExpoClientContent(): string {
  return nativeRealtimeClientContent("expo");
}

export function realtimeDesktopClientContent(): string {
  return nativeRealtimeClientContent("desktop");
}

export function realtimeUnsupportedExpoClientContent(): string {
  return unsupportedNativeRealtimeClientContent("expo");
}

export function realtimeUnsupportedDesktopClientContent(): string {
  return unsupportedNativeRealtimeClientContent("desktop");
}
