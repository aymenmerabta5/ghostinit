// @allow-long 1820: one cross-platform renderer shares messaging UI, bounded websocket hosts, runtime compatibility, and attachment surfaces
import { file, type TemplateFile } from "../../../shared.js";
import { realtimeNextClientContent, realtimeTanstackClientContent } from "../realtime/index.js";
import { messagingAttachmentRouteFiles } from "./attachments.js";
import { messagingConvexAttachmentRouteFiles } from "./convex-attachments.js";
import { messagingConvexTanstackWebFiles } from "./convex-tanstack.js";
import { convexWebMessagingFeatureFiles } from "./web-convex.js";
import { nativeExpoMessagingFiles } from "./native-expo.js";
import { nativeDesktopMessagingFiles } from "./native-desktop.js";
import { nextUpgradeDispatcherContent } from "./next-upgrade.js";
import { postgresWebMessagingFeatureFiles } from "./web-postgres.js";

function messagingMessageListContent(hooksImport: string, router: "next" | "tanstack"): string {
  const imageImport = router === "next" ? 'import Image from "next/image";\n' : "";
  const attachmentImage =
    router === "next"
      ? '<Image src={attachment.url} alt={t("attachmentAlt")} width={200} height={200} className="h-auto max-w-[200px] rounded" />'
      : '<img src={attachment.url} alt={t("attachmentAlt")} className="max-w-[200px] rounded" loading="lazy" />';
  return `"use client";
${imageImport}import type { JSX } from "react";
import { Attachment, AttachmentContent, AttachmentGroup, AttachmentMedia, AttachmentTitle, Bubble, BubbleContent, Marker, MarkerContent, Message, MessageContent, MessageHeader, MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/chat";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { MessageSummary } from "${hooksImport}";

export function MessageList({
  messages,
  isLoading,
  isTyping,
}: {
  messages: MessageSummary[] | undefined;
  isLoading: boolean;
  isTyping: boolean;
}): JSX.Element {
  const locale = useSurfaceLocale();
  const t = useSurfaceTranslations("messaging");
  if (isLoading) {
    return <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("loadingMessages")}>{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
  }
  return <MessageScrollerProvider autoScroll><MessageScroller className="max-h-[400px]"><MessageScrollerViewport><MessageScrollerContent role="log" aria-live="polite" aria-label={t("messagesLabel")}>
    {(messages ?? []).length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noMessages")}</EmptyTitle></EmptyHeader></Empty> : (messages ?? []).map((message) => (
      <MessageScrollerItem key={message.id} messageId={message.id}><Message align="start"><MessageContent className="text-start"><MessageHeader>{message.senderId.slice(0, 6)} • {new Date(message.createdAt).toLocaleTimeString(locale)}</MessageHeader>{message.body ? <Bubble variant="muted"><BubbleContent>{message.body}</BubbleContent></Bubble> : null}{message.attachments?.length ? <AttachmentGroup>{message.attachments.map((attachment) => <Attachment key={attachment.url} state="done">{attachment.mimeType.startsWith("image/") ? <AttachmentMedia>${attachmentImage}</AttachmentMedia> : null}<AttachmentContent><AttachmentTitle><a href={attachment.url} className="underline">{attachment.url}</a></AttachmentTitle></AttachmentContent></Attachment>)}</AttachmentGroup> : null}</MessageContent></Message></MessageScrollerItem>
    ))}
    {isTyping ? <MessageScrollerItem messageId="typing"><Marker><MarkerContent className="shimmer">{t("typing")}</MarkerContent></Marker></MessageScrollerItem> : null}
  </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>;
}
`;
}

function messagingNextRouteContent(mode: "monorepo" | "single"): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest, type ConversationDto } from "${applicationModule}";
import MessagesPage from "./client";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";

function conversationSummary(value: ConversationDto) {
  return [{ id: value.id }];
}

async function MessagesData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const current = await application.me();
  const principal = application.principal;
  if (!current.user || !principal) redirect("/sign-in");
  const result = await application.messaging.listConversations();
  const scope = { userId: principal.identityUserId, sessionId: principal.sessionId, tenantId: principal.activeOrganizationId, teamId: principal.activeTeamId };
  return <RequestOwnedSnapshot scope={scope}><MessagesPage initialConversations={result.conversations.flatMap(conversationSummary)} /></RequestOwnedSnapshot>;
}

export default function Page(): React.JSX.Element {
  return <Suspense fallback={<div className="min-h-48" aria-busy="true" />}><MessagesData /></Suspense>;
}
`;
}

function singleSafeRealtimeContent(content: string, mode: "monorepo" | "single"): string {
  return mode === "single"
    ? content
        .replace('from "@repo/api"', 'from "@/server/api"')
        .replace('from "@repo/config/', 'from "@/lib/env/')
    : content;
}

export function messagingNextFiles(mode: "monorepo" | "single" = "monorepo"): TemplateFile[] {
  return [
    file(
      "apps/web/src/lib/realtime.ts",
      singleSafeRealtimeContent(realtimeNextClientContent(), mode),
    ),
    ...postgresWebMessagingFeatureFiles(
      "next",
      messagingMessageListContent("../model", "next"),
      messagingNextRouteContent(mode),
    ),
  ];
}

export function messagingTanstackFiles(mode: "monorepo" | "single" = "monorepo"): TemplateFile[] {
  return [
    file(
      "apps/web/src/lib/realtime.ts",
      singleSafeRealtimeContent(realtimeTanstackClientContent(), mode),
    ),
    ...postgresWebMessagingFeatureFiles(
      "tanstack",
      messagingMessageListContent("../model", "tanstack"),
      "",
    ),
  ];
}

export function messagingExpoFiles(
  mode: "monorepo" | "single" = "monorepo",
  hasI18n = false,
): TemplateFile[] {
  return nativeExpoMessagingFiles("postgres", mode, hasI18n);
}

export function messagingConvexNextFiles(mode: "monorepo" | "single" = "monorepo"): TemplateFile[] {
  return convexWebMessagingFeatureFiles(mode, "next");
}

export function messagingConvexTanstackFiles(
  mode: "monorepo" | "single" = "monorepo",
): TemplateFile[] {
  return messagingConvexTanstackWebFiles(mode);
}

function websocketAuthContent(mode: "monorepo" | "single"): string {
  const authImport = mode === "monorepo" ? "@repo/auth" : "@/server/auth";
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const databaseImport =
    mode === "monorepo"
      ? `import { db, messagingWebsocketTickets, sessions, users } from "@repo/database";`
      : `import { db } from "@/server/db";
import { sessions, users } from "@/server/db/schema/auth";
import { messagingWebsocketTickets } from "@/server/db/schema/messaging";`;
  return `import { createHash } from "node:crypto";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { auth } from "${authImport}";
import { createContext, type ApiContext } from "${apiImport}";
import { env } from "${mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server"}";
${databaseImport}

export interface WebSocketIdentity {
  userId: string;
  sessionId: string;
  authentication: "cookie" | "ticket";
}

export interface AuthenticatedWebSocket extends WebSocketIdentity {
  context: ApiContext;
}

export const MAX_WEBSOCKET_CONNECTIONS = 512;
export const MAX_WEBSOCKETS_PER_USER = 8;
export const WEBSOCKET_AUTHENTICATION_TIMEOUT_MS = 5_000;
export const NATIVE_WEBSOCKET_PROTOCOL_PREFIX = "ghostinit-ticket.";

let nextWebSocketSlot = 1;
const webSocketSlotOwners = new Map<number, string>();
const webSocketSlotsByUser = new Map<string, number>();

export function acquireWebSocketSlot(userId: string): number | null {
  const userSlots = webSocketSlotsByUser.get(userId) ?? 0;
  if (
    webSocketSlotOwners.size >= MAX_WEBSOCKET_CONNECTIONS ||
    userSlots >= MAX_WEBSOCKETS_PER_USER
  ) {
    return null;
  }
  const slot = nextWebSocketSlot++;
  webSocketSlotOwners.set(slot, userId);
  webSocketSlotsByUser.set(userId, userSlots + 1);
  return slot;
}

export function releaseWebSocketSlot(slot: number): void {
  const userId = webSocketSlotOwners.get(slot);
  if (!userId) return;
  webSocketSlotOwners.delete(slot);
  const remaining = (webSocketSlotsByUser.get(userId) ?? 1) - 1;
  if (remaining > 0) webSocketSlotsByUser.set(userId, remaining);
  else webSocketSlotsByUser.delete(userId);
}

export function trustedWebSocketOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;
  const configured = [
    env.BETTER_AUTH_URL,
    env.SITE_URL,
  ];
  const allowed = new Set<string>();
  for (const value of configured) {
    if (!value) continue;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Invalid configuration never widens the origin allowlist.
    }
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function nativeWebSocketTicket(headers: Headers): string | null {
  const candidates = (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(NATIVE_WEBSOCKET_PROTOCOL_PREFIX));
  if (candidates.length !== 1) return null;
  const ticket = candidates[0]?.slice(NATIVE_WEBSOCKET_PROTOCOL_PREFIX.length) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(ticket) ? ticket : null;
}

export function hasNativeWebSocketTicket(headers: Headers): boolean {
  return nativeWebSocketTicket(headers) !== null;
}

function ticketDigest(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

async function currentTicketIdentity(expected: WebSocketIdentity): Promise<AuthenticatedWebSocket | null> {
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      name: users.name,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, expected.sessionId),
        eq(sessions.userId, expected.userId),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt),
        or(eq(users.banned, false), isNull(users.banned), lte(users.banExpires, now)),
      ),
    )
    .limit(1);
  const current = rows[0];
  if (!current) return null;
  const headers = new Headers({ "x-ghostinit-native-client": "websocket-ticket" });
  const requestContext = await createContext(headers);
  // A ticket can authorize only the messaging WebSocket router. Its facade must
  // remain anonymous so ordinary HTTP application operations fail closed.
  if (requestContext.user || requestContext.application.principal) return null;
  const context: ApiContext = {
    ...requestContext,
    headers,
    websocketAuthentication: "ticket",
    sessionId: current.sessionId,
    user: {
      id: current.userId,
      identityId: current.userId,
      email: current.email,
      emailVerified: current.emailVerified === true,
      name: current.name ?? null,
      role: current.role ?? "user",
      banned: false,
    },
  };
  return { ...expected, context };
}

async function consumeNativeWebSocketTicket(
  headers: Headers,
): Promise<AuthenticatedWebSocket | null> {
  const ticket = nativeWebSocketTicket(headers);
  if (!ticket) return null;
  const consumed = await db
    .delete(messagingWebsocketTickets)
    .where(
      and(
        eq(messagingWebsocketTickets.ticketHash, ticketDigest(ticket)),
        gt(messagingWebsocketTickets.expiresAt, new Date()),
      ),
    )
    .returning({
      userId: messagingWebsocketTickets.userId,
      sessionId: messagingWebsocketTickets.sessionId,
    });
  const identity = consumed[0];
  if (!identity) return null;
  return await currentTicketIdentity({ ...identity, authentication: "ticket" });
}

async function authenticateCookieWebSocket(
  headers: Headers,
  expected?: WebSocketIdentity,
): Promise<AuthenticatedWebSocket | null> {
  if (expected?.authentication === "ticket") return null;
  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  const userId = session?.user?.id;
  const sessionId = session?.session?.id;
  if (
    !userId ||
    !sessionId ||
    session.user.banned === true ||
    (expected && (expected.userId !== userId || expected.sessionId !== sessionId))
  ) {
    return null;
  }
  const context = await createContext(headers);
  if (
    !context.user?.id ||
    context.user.id !== userId ||
    context.sessionId !== sessionId ||
    context.user.banned === true
  ) {
    return null;
  }
  return { userId, sessionId, authentication: "cookie", context };
}

async function withAuthenticationDeadline(
  operation: Promise<AuthenticatedWebSocket | null>,
): Promise<AuthenticatedWebSocket | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), WEBSOCKET_AUTHENTICATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function authenticateWebSocket(
  headers: Headers,
  expected?: WebSocketIdentity,
): Promise<AuthenticatedWebSocket | null> {
  if (expected?.authentication === "ticket") {
    return await withAuthenticationDeadline(currentTicketIdentity(expected));
  }
  if (!expected && hasNativeWebSocketTicket(headers)) {
    return await withAuthenticationDeadline(consumeNativeWebSocketTicket(headers));
  }
  return await withAuthenticationDeadline(authenticateCookieWebSocket(headers, expected));
}
`;
}

function tanstackWebSocketFiles(mode: "monorepo" | "single"): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const outboxImport =
    mode === "monorepo" ? "@repo/api/messaging-outbox" : "@/server/api/messaging-outbox";
  const cleanupImport =
    mode === "monorepo" ? "@repo/api/workers/storage/cleanup" : "@/server/workers/storage/cleanup";
  return [
    file(`${root}server/transport/websocket-auth.ts`, websocketAuthContent(mode)),
    file(
      `${root}server/plugins/00-nitro-websocket-compat.ts`,
      `import type { Hooks as CrosswsHooks } from "crossws";
import { definePlugin } from "nitro";

const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;

type BunServeOptions = Record<PropertyKey, unknown>;
type BunServe = (options: BunServeOptions) => unknown;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function hooksFrom(value: unknown): Partial<CrosswsHooks> | undefined {
  return isRecord(value) ? (value as Partial<CrosswsHooks>) : undefined;
}

function rejectionHooks(status: 404 | 503): Partial<CrosswsHooks> {
  return {
    upgrade: () =>
      new Response(status === 404 ? "WebSocket route not found" : "WebSocket service unavailable", {
        status,
      }),
  };
}

function guardedApplicationHooks(value: unknown): Partial<CrosswsHooks> {
  const applicationHooks = hooksFrom(value);
  const upgrade = applicationHooks?.upgrade;
  if (typeof upgrade !== "function") {
    return rejectionHooks(503);
  }
  return {
    ...applicationHooks,
    upgrade: async (request) => {
      try {
        return await upgrade(request);
      } catch {
        return new Response("WebSocket service unavailable", { status: 503 });
      }
    },
  };
}

function isWebSocketUpgrade(request: Request): boolean {
  return (request.headers.get("upgrade") ?? "")
    .toLowerCase()
    .split(",")
    .some((value) => value.trim() === "websocket");
}

function requestPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

function responseWithHooks(status: 404 | 503, hooks: Partial<CrosswsHooks>): Response {
  return Object.assign(
    new Response(status === 404 ? "WebSocket route not found" : "WebSocket service unavailable", {
      status,
    }),
    { crossws: hooks },
  );
}

/**
 * Nitro 3 beta resolves websocket hooks by fetching the requested route. Its
 * empty-hook fallback otherwise upgrades unknown paths, so wrap only websocket
 * fetches and preserve an explicit /api/ws boundary. @orpc/server/crossws owns
 * the application protocol and dispatches accepted frames to the typed router.
 */
export default definePlugin((nitroApp) => {
  const originalFetch = nitroApp.fetch.bind(nitroApp);
  nitroApp.fetch = async (request) => {
    if (!isWebSocketUpgrade(request)) return originalFetch(request);
    if (requestPathname(request) !== "/api/ws") {
      return responseWithHooks(404, rejectionHooks(404));
    }
    let response: Response;
    try {
      response = await originalFetch(request);
    } catch {
      return responseWithHooks(503, rejectionHooks(503));
    }
    return Object.assign(response, {
      crossws: guardedApplicationHooks(Reflect.get(response, "crossws")),
    });
  };
  const bunValue: unknown = Reflect.get(globalThis, "Bun");
  if (bunValue === undefined) return;
  if (!isRecord(bunValue)) {
    throw new Error("Nitro websocket compatibility adapter received an invalid Bun runtime");
  }
  const bunRuntime = bunValue;
  const originalServe = bunRuntime.serve;
  if (typeof originalServe !== "function") {
    throw new Error("Nitro websocket compatibility adapter cannot verify Bun.serve");
  }
  const invokeOriginalServe: BunServe = (options) =>
    Reflect.apply(originalServe, bunRuntime, [options]);
  let armed = true;
  const patchedServe: BunServe = (options) => {
    const websocket = isRecord(options.websocket) ? options.websocket : undefined;
    if (!armed || !websocket) return invokeOriginalServe(options);
    armed = false;
    bunRuntime.serve = originalServe;
    if (bunRuntime.serve !== originalServe) {
      throw new Error("Nitro websocket compatibility adapter could not restore Bun.serve");
    }
    return invokeOriginalServe({
      ...options,
      websocket: { ...websocket, maxPayloadLength: MAX_WEBSOCKET_PAYLOAD_BYTES },
    });
  };
  bunRuntime.serve = patchedServe;
  if (bunRuntime.serve !== patchedServe) {
    throw new Error("Nitro websocket compatibility adapter could not wrap Bun.serve");
  }
});
`,
    ),
    file(
      `${root}server/plugins/messaging-outbox.ts`,
      `import { definePlugin } from "nitro";
import { startMessagingOutboxWorker } from "${outboxImport}";
import { runPostgresStorageCleanupWorker } from "${cleanupImport}";

interface MessagingOutboxGlobal {
  __ghostinitMessagingOutboxWorker?: ReturnType<typeof startMessagingOutboxWorker>;
  __ghostinitStorageCleanup?: {
    controller: AbortController;
    task: Promise<void>;
  };
}

export default definePlugin((nitroApp) => {
  const processState = globalThis as typeof globalThis & MessagingOutboxGlobal;
  const worker =
    processState.__ghostinitMessagingOutboxWorker ?? startMessagingOutboxWorker();
  processState.__ghostinitMessagingOutboxWorker = worker;
  const cleanup =
    processState.__ghostinitStorageCleanup ?? (() => {
      const controller = new AbortController();
      const task = runPostgresStorageCleanupWorker(controller.signal).catch(() => {
        console.error(JSON.stringify({ scope: "storage-cleanup", event: "worker-stopped" }));
      });
      return { controller, task };
  })();
  processState.__ghostinitStorageCleanup = cleanup;
  let stopped = false;
  nitroApp.hooks.hook("close", async () => {
    if (stopped) return;
    stopped = true;
    if (processState.__ghostinitMessagingOutboxWorker === worker) {
      delete processState.__ghostinitMessagingOutboxWorker;
      await worker.stop();
    }
    if (processState.__ghostinitStorageCleanup === cleanup) {
      delete processState.__ghostinitStorageCleanup;
      cleanup.controller.abort();
      await cleanup.task;
    }
  });
});
`,
    ),
    file(
      `${root}server/websocket-handler.ts`,
      `import { experimental_RPCHandler } from "@orpc/server/crossws";
import { defineWebSocket, defineWebSocketHandler } from "nitro/h3";
import { messagingWebSocketRouter } from "${apiImport}";
import {
  acquireWebSocketSlot,
  authenticateWebSocket,
  hasNativeWebSocketTicket,
  releaseWebSocketSlot,
  trustedWebSocketOrigin,
  type WebSocketIdentity,
} from "./transport/websocket-auth";

const handler = new experimental_RPCHandler(messagingWebSocketRouter);
const MAX_RPC_MESSAGE_BYTES = 64 * 1024;
const MAX_RPC_QUEUE_MESSAGES = 32;
const MAX_RPC_QUEUE_BYTES = 256 * 1024;

interface RpcQueueState {
  tail: Promise<void>;
  messages: number;
  bytes: number;
  closed: boolean;
}

const rpcQueues = new WeakMap<object, RpcQueueState>();

function readIdentity(value: unknown): WebSocketIdentity | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.userId === "string" &&
    typeof record.sessionId === "string" &&
    (record.authentication === "cookie" || record.authentication === "ticket")
    ? {
        userId: record.userId,
        sessionId: record.sessionId,
        authentication: record.authentication,
      }
    : null;
}

function readSlot(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function messageByteLength(message: { rawData: unknown; uint8Array(): Uint8Array }): number {
  return typeof message.rawData === "string"
    ? new TextEncoder().encode(message.rawData).byteLength
    : message.uint8Array().byteLength;
}

function queueFor(peer: object): RpcQueueState {
  let state = rpcQueues.get(peer);
  if (!state) {
    state = { tail: Promise.resolve(), messages: 0, bytes: 0, closed: false };
    rpcQueues.set(peer, state);
  }
  return state;
}

export const applicationWebSocketHooks = defineWebSocket({
  async upgrade(request) {
    if (!hasNativeWebSocketTicket(request.headers) && !trustedWebSocketOrigin(request.headers)) {
      return new Response("WebSocket origin denied", { status: 403 });
    }
    const authenticated = await authenticateWebSocket(request.headers);
    if (!authenticated) {
      return new Response("WebSocket authentication required", { status: 401 });
    }
    return {
      context: {
        ...request.context,
        websocketIdentity: {
          userId: authenticated.userId,
          sessionId: authenticated.sessionId,
          authentication: authenticated.authentication,
        },
      },
    };
  },
  open(peer) {
    const expected = readIdentity(peer.context.websocketIdentity);
    if (!expected) {
      peer.close(1008, "WebSocket authentication required");
      return;
    }
    const slot = acquireWebSocketSlot(expected.userId);
    if (slot === null) {
      peer.close(1013, "WebSocket connection limit reached");
      return;
    }
    peer.context.websocketSlot = slot;
    queueFor(peer);
  },
  async message(peer, message) {
    const expected = readIdentity(peer.context.websocketIdentity);
    if (!expected || readSlot(peer.context.websocketSlot) === null) {
      peer.close(1008, "WebSocket authentication required");
      return;
    }
    const bytes = messageByteLength(message);
    if (bytes > MAX_RPC_MESSAGE_BYTES) {
      peer.close(1009, "WebSocket message is too large");
      return;
    }
    const state = queueFor(peer);
    if (
      state.closed ||
      state.messages >= MAX_RPC_QUEUE_MESSAGES ||
      state.bytes + bytes > MAX_RPC_QUEUE_BYTES
    ) {
      state.closed = true;
      peer.close(1013, "WebSocket request queue overloaded");
      return;
    }
    state.messages += 1;
    state.bytes += bytes;
    const work = state.tail
      .then(async () => {
        if (state.closed) return;
        const authenticated = await authenticateWebSocket(peer.request.headers, expected);
        if (!authenticated) {
          state.closed = true;
          peer.close(1008, "WebSocket session is no longer authorized");
          return;
        }
        await handler.message(peer, message, { context: authenticated.context });
      })
      .catch(() => {
        state.closed = true;
        peer.close(1011, "WebSocket request failed");
      })
      .finally(() => {
        state.messages -= 1;
        state.bytes -= bytes;
      });
    state.tail = work;
    await work;
  },
  close(peer) {
    const state = rpcQueues.get(peer);
    if (state) state.closed = true;
    rpcQueues.delete(peer);
    const slot = readSlot(peer.context.websocketSlot);
    if (slot !== null) releaseWebSocketSlot(slot);
    peer.context.websocketSlot = undefined;
    handler.close(peer);
  },
});

export default defineWebSocketHandler(applicationWebSocketHooks);
`,
    ),
    file(
      `${root}server/routes/api/ws.ts`,
      `export { default } from "../../websocket-handler";
`,
    ),
  ];
}

function nextWebSocketFiles(mode: "monorepo" | "single"): TemplateFile[] {
  const root = mode === "monorepo" ? "apps/web/" : "";
  const apiImport = mode === "monorepo" ? "@repo/api" : "@/server/api";
  const outboxImport =
    mode === "monorepo" ? "@repo/api/messaging-outbox" : "@/server/api/messaging-outbox";
  const cleanupImport =
    mode === "monorepo" ? "@repo/api/workers/storage/cleanup" : "@/server/workers/storage/cleanup";
  return [
    file(`${root}src/server/transport/websocket-auth.ts`, websocketAuthContent(mode)),
    file(
      `${root}src/app/api/ws/route.ts`,
      `import { trustedWebSocketOrigin } from "@/server/transport/websocket-auth";

export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  if (!trustedWebSocketOrigin(request.headers)) {
    return new Response("WebSocket origin denied", { status: 403 });
  }
  return new Response(
    "WebSocket upgrades require the generated custom server. Run bun run dev in development or bun run start in production.",
    { status: 501 },
  );
}
`,
    ),
    file(
      mode === "single" ? "next-server.ts" : `${root}server.ts`,
      `import { IncomingMessage, Server, type IncomingHttpHeaders } from "node:http";
import { Duplex } from "node:stream";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { messagingWebSocketRouter } from "${apiImport}";
import { startMessagingOutboxWorker } from "${outboxImport}";
import { runPostgresStorageCleanupWorker } from "${cleanupImport}";
import {
  acquireWebSocketSlot,
  authenticateWebSocket,
  hasNativeWebSocketTicket,
  releaseWebSocketSlot,
  trustedWebSocketOrigin,
  type WebSocketIdentity,
} from "./src/server/transport/websocket-auth";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "0.0.0.0";

${nextUpgradeDispatcherContent()}

const server = new ApplicationHttpServer(async (request, response) => {
  await handle(request, response);
});
// Upgrade admission must work before Next installs its listener on the first HTTP request.
server.on("upgrade", () => {});
const app = next({
  dev: process.env.NODE_ENV !== "production",
  // Bun cannot resolve new Turbopack external-package links after a cold start.
  webpack: Boolean(process.versions.bun),
  hostname,
  port,
  httpServer: server,
  // The launcher passes the source app root because this bundle lives under .ghostinit/runtime.
  dir: process.argv[2] ?? dirname(fileURLToPath(import.meta.url)),
});
await app.prepare();
const messagingOutbox = startMessagingOutboxWorker();
const storageCleanupAbort = new AbortController();
const storageCleanupTask = runPostgresStorageCleanupWorker(storageCleanupAbort.signal).catch(
  () => {
    console.error(JSON.stringify({ scope: "storage-cleanup", event: "worker-stopped" }));
  },
);
const handle = app.getRequestHandler();
const { RPCHandler } = await import("@orpc/server/websocket");
const rpcHandler = new RPCHandler(messagingWebSocketRouter);
const MAX_WEBSOCKET_PAYLOAD_BYTES = 64 * 1024;
const MAX_RPC_QUEUE_MESSAGES = 32;
const MAX_RPC_QUEUE_BYTES = 256 * 1024;
const webSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_WEBSOCKET_PAYLOAD_BYTES,
  perMessageDeflate: false,
});

interface SocketQueueState {
  tail: Promise<void>;
  messages: number;
  bytes: number;
  closed: boolean;
}

function toWebHeaders(input: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (typeof value === "string") {
      headers.set(name, value);
    }
  }
  return headers;
}

function rejectUpgrade(
  socket: { end(data: string, callback: () => void): unknown; destroy(): unknown },
  status: number,
  text: string,
): void {
  socket.end("HTTP/1.1 " + status + " " + text + "\\r\\nConnection: close\\r\\n\\r\\n", () => socket.destroy());
}

async function currentIdentity(
  headers: Headers,
  expected?: WebSocketIdentity,
) {
  return await authenticateWebSocket(headers, expected);
}

function rawDataByteLength(data: RawData): number {
  if (Array.isArray(data)) return data.reduce((total, part) => total + part.byteLength, 0);
  return data.byteLength;
}

function rpcMessageData(data: RawData, isBinary: boolean): string | ArrayBuffer {
  if (Array.isArray(data)) {
    const joined = Buffer.concat(data);
    return isBinary ? Uint8Array.from(joined).buffer : joined.toString();
  }
  if (data instanceof ArrayBuffer) {
    return isBinary ? data.slice(0) : new TextDecoder().decode(data);
  }
  const copied = Uint8Array.from(data);
  return isBinary ? copied.buffer : new TextDecoder().decode(copied);
}

function registerRpcSocket(
  socket: WebSocket,
  headers: Headers,
  expected: WebSocketIdentity,
): void {
  const queue: SocketQueueState = {
    tail: Promise.resolve(),
    messages: 0,
    bytes: 0,
    closed: false,
  };
  socket.on("message", (data, isBinary) => {
    const bytes = rawDataByteLength(data);
    if (bytes > MAX_WEBSOCKET_PAYLOAD_BYTES) {
      queue.closed = true;
      socket.close(1009, "WebSocket message is too large");
      return;
    }
    if (
      queue.closed ||
      queue.messages >= MAX_RPC_QUEUE_MESSAGES ||
      queue.bytes + bytes > MAX_RPC_QUEUE_BYTES
    ) {
      queue.closed = true;
      socket.close(1013, "WebSocket request queue overloaded");
      return;
    }
    const message = rpcMessageData(data, isBinary);
    queue.messages += 1;
    queue.bytes += bytes;
    const work = queue.tail
      .then(async () => {
        if (queue.closed) return;
        const current = await currentIdentity(headers, expected);
        if (!current) {
          queue.closed = true;
          socket.close(1008, "WebSocket session is no longer authorized");
          return;
        }
        await rpcHandler.message(socket, message, {
          context: current.context,
        });
      })
      .catch(() => {
        queue.closed = true;
        socket.close(1011, "WebSocket request failed");
      })
      .finally(() => {
        queue.messages -= 1;
        queue.bytes -= bytes;
      });
    queue.tail = work;
  });
  socket.on("close", () => {
    queue.closed = true;
    rpcHandler.close(socket);
  });
}

async function upgradeRequest(
  req: import("node:http").IncomingMessage,
  socket: import("node:stream").Duplex,
  head: Buffer,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://" + (req.headers.host ?? "localhost"));
  if (url.pathname !== "/api/ws") {
    socket.destroy();
    return;
  }
  const headers = toWebHeaders(req.headers);
  if (!hasNativeWebSocketTicket(headers) && !trustedWebSocketOrigin(headers)) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  const authenticated = await currentIdentity(headers);
  if (!authenticated) {
    rejectUpgrade(socket, 401, "Unauthorized");
    return;
  }
  const expected = {
    userId: authenticated.userId,
    sessionId: authenticated.sessionId,
    authentication: authenticated.authentication,
  };
  const slot = acquireWebSocketSlot(expected.userId);
  if (slot === null) {
    rejectUpgrade(socket, 429, "Too Many Requests");
    return;
  }
  let upgraded = false;
  try {
    webSocketServer.handleUpgrade(req, socket, head, (webSocket) => {
      upgraded = true;
      webSocket.once("close", () => releaseWebSocketSlot(slot));
      registerRpcSocket(webSocket, headers, expected);
    });
  } finally {
    if (!upgraded) releaseWebSocketSlot(slot);
  }
}

server.once("close", () => storageCleanupAbort.abort());
server.listen(port, hostname, () => {
  const publicHost = hostname === "0.0.0.0" ? "localhost" : hostname.includes(":") ? "[" + hostname + "]" : hostname;
  console.log("> Ready on http://" + publicHost + ":" + port + " (oRPC WebSocket /api/ws)");
});

let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  shutdownPromise ??= (async () => {
    storageCleanupAbort.abort();
    await Promise.all([messagingOutbox.stop(), storageCleanupTask]);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  })();
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown().catch(() => {
      console.error(JSON.stringify({ scope: "web-server", event: "shutdown-failed" }));
      process.exitCode = 1;
    });
  });
}
`,
    ),
  ];
}
export function messagingFilesFor(
  framework: string,
  database: string,
  apps: string[],
  mode: "monorepo" | "single" = "monorepo",
  hasI18n = false,
): TemplateFile[] {
  const hasWeb = apps.includes("web");
  const hasMobile = apps.includes("mobile");
  const hasDesktop = apps.includes("desktop");
  const isConvex = database === "convex";
  const isTanstack = framework === "tanstack-start";
  const files: TemplateFile[] = [];
  if (!hasWeb && !hasMobile && !hasDesktop) return files;
  if (isConvex) {
    if (hasWeb) {
      files.push(
        ...(isTanstack ? messagingConvexTanstackFiles(mode) : messagingConvexNextFiles(mode)),
      );
      files.push(...messagingConvexAttachmentRouteFiles(isTanstack ? "tanstack" : "next", mode));
    }
    if (hasMobile) {
      files.push(...nativeExpoMessagingFiles("convex", mode, hasI18n));
    }
    if (hasDesktop) {
      files.push(...nativeDesktopMessagingFiles("convex", mode, hasI18n));
    }
    return files;
  }
  // Postgres (oRPC+WS)
  if (hasWeb) {
    if (isTanstack) files.push(...messagingTanstackFiles(mode));
    else files.push(...messagingNextFiles(mode));
  }
  if (hasMobile) files.push(...nativeExpoMessagingFiles("postgres", mode, hasI18n));
  if (hasDesktop) files.push(...nativeDesktopMessagingFiles("postgres", mode, hasI18n));

  if (isTanstack && hasWeb) files.push(...tanstackWebSocketFiles(mode));
  else if (hasWeb) files.push(...nextWebSocketFiles(mode));
  if (hasWeb) {
    files.push(...messagingAttachmentRouteFiles(isTanstack ? "tanstack" : "next", mode));
  }
  files.push(file("data/uploads/.gitkeep", ""));
  return files;
}
/** Pure reference used by generation tests and mirrored by emitted WS handshakes. */
export function isTrustedWebSocketOrigin(
  origin: string | null | undefined,
  configuredUrls: readonly (string | undefined)[],
): boolean {
  if (!origin) return false;
  const allowed = new Set<string>();
  for (const value of configuredUrls) {
    if (!value) continue;
    try {
      allowed.add(new URL(value).origin);
    } catch {
      // Invalid configured URLs never widen the allowlist.
    }
  }
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}
