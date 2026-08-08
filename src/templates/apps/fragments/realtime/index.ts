export function realtimeNextClientContent(): string {
  return `"use client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

let ws: WebSocket | null = null;
let client: RouterClient<typeof appRouter> | null = null;
let listeners = new Set<(ev: unknown) => void>();

function getWsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  if (typeof window !== "undefined") return window.location.origin.replace(/^http/, "ws") + "/api/ws";
  return "ws://localhost:3000/api/ws";
}

export function getMessagingClient(): RouterClient<typeof appRouter> {
  if (typeof window === "undefined") throw new Error("getMessagingClient only in browser");
  if (client && ws && ws.readyState === WebSocket.OPEN) return client;
  const url = getWsUrl();
  ws = new WebSocket(url);
  ws.addEventListener("message", (e) => {
    try { const data = JSON.parse(e.data as string); for (const l of listeners) l(data); } catch {}
  });
  ws.addEventListener("close", () => {
    // auto-reconnect with backoff
    setTimeout(() => { ws = null; client = null; }, 1000);
  });
  client = createORPCClient(new RPCLink({ websocket: ws as unknown as WebSocket }));
  return client;
}

export function subscribeRealtime(handler: (ev: unknown) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function sendTypingRealtime(conversationId: string, isTyping: boolean): void {
  try {
    const c = getMessagingClient() as unknown as { messaging: { sendTyping: (o: unknown) => Promise<unknown> } };
    void c.messaging.sendTyping({ conversationId, isTyping });
  } catch {}
}
`;
}

export function realtimeTanstackClientContent(): string {
  return `"use client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

let ws: WebSocket | null = null;
let client: RouterClient<typeof appRouter> | null = null;
let listeners = new Set<(ev: unknown) => void>();

function getWsUrl(): string {
  const envUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;
  if (typeof window !== "undefined") return window.location.origin.replace(/^http/, "ws") + "/api/ws";
  return "ws://localhost:3000/api/ws";
}

export function getMessagingClient(): RouterClient<typeof appRouter> {
  if (typeof window === "undefined") throw new Error("getMessagingClient only in browser");
  if (client && ws && ws.readyState === WebSocket.OPEN) return client;
  const url = getWsUrl();
  ws = new WebSocket(url);
  ws.addEventListener("message", (e) => {
    try { const data = JSON.parse(e.data as string); for (const l of listeners) l(data); } catch {}
  });
  ws.addEventListener("close", () => { setTimeout(() => { ws = null; client = null; }, 1000); });
  client = createORPCClient(new RPCLink({ websocket: ws as unknown as WebSocket }));
  return client;
}

export function subscribeRealtime(handler: (ev: unknown) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function sendTypingRealtime(conversationId: string, isTyping: boolean): void {
  try {
    const c = getMessagingClient() as unknown as { messaging: { sendTyping: (o: unknown) => Promise<unknown> } };
    void c.messaging.sendTyping({ conversationId, isTyping });
  } catch {}
}
`;
}

export function realtimeExpoClientContent(): string {
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";
import * as SecureStore from "expo-secure-store";

let ws: WebSocket | null = null;
let client: RouterClient<typeof appRouter> | null = null;
let listeners = new Set<(ev: unknown) => void>();

function getWsUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_WS_URL || process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return (envUrl as string).replace(/^http/, "ws") + "/api/ws";
  return "ws://localhost:3000/api/ws";
}

async function getToken(): Promise<string | null> {
  try { return await SecureStore.getItemAsync("auth_token"); } catch { return null; }
}

export async function getMessagingClient(): Promise<RouterClient<typeof appRouter>> {
  if (client && ws && ws.readyState === WebSocket.OPEN) return client;
  const base = getWsUrl();
  const token = await getToken();
  const url = token ? \`\${base}?token=\${encodeURIComponent(token)}\` : base;
  ws = new WebSocket(url);
  ws.addEventListener("message", (e) => {
    try { const data = JSON.parse((e as unknown as { data: string }).data); for (const l of listeners) l(data); } catch {}
  });
  ws.addEventListener("close", () => { setTimeout(() => { ws = null; client = null; }, 1000); });
  client = createORPCClient(new RPCLink({ websocket: ws as unknown as WebSocket }));
  return client;
}

export function subscribeRealtime(handler: (ev: unknown) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function sendTypingRealtime(conversationId: string, isTyping: boolean): void {
  // fire-and-forget via WS RPC
  void (async () => {
    try {
      const c = await getMessagingClient() as unknown as { messaging: { sendTyping: (o: unknown) => Promise<unknown> } };
      await c.messaging.sendTyping({ conversationId, isTyping });
    } catch {}
  })();
}
`;
}

export function realtimeDesktopClientContent(): string {
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/websocket";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

let ws: WebSocket | null = null;
let client: RouterClient<typeof appRouter> | null = null;
let listeners = new Set<(ev: unknown) => void>();

function getWsUrl(): string {
  const envUrl = (typeof process !== "undefined" && ((process as unknown as { env: Record<string, string> }).env.DESKTOP_WS_URL || (process as unknown as { env: Record<string, string> }).env.NEXT_PUBLIC_WS_URL || (process as unknown as { env: Record<string, string> }).env.VITE_WS_URL)) as string | undefined;
  if (envUrl) return envUrl as string;
  return "ws://localhost:3000/api/ws";
}

export function getMessagingClient(): RouterClient<typeof appRouter> {
  if (client && ws && ws.readyState === WebSocket.OPEN) return client;
  const url = getWsUrl();
  ws = new WebSocket(url);
  ws.addEventListener("message", (e) => {
    try { const data = JSON.parse((e as unknown as { data: string }).data); for (const l of listeners) l(data); } catch {}
  });
  ws.addEventListener("close", () => { setTimeout(() => { ws = null; client = null; }, 1000); });
  client = createORPCClient(new RPCLink({ websocket: ws as unknown as WebSocket }));
  return client;
}

export function subscribeRealtime(handler: (ev: unknown) => void): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function sendTypingRealtime(conversationId: string, isTyping: boolean): void {
  try {
    const c = getMessagingClient() as unknown as { messaging: { sendTyping: (o: unknown) => Promise<unknown> } };
    void c.messaging.sendTyping({ conversationId, isTyping });
  } catch {}
}
`;
}
