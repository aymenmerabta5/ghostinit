// @allow-long 660: the realtime renderer keeps local authorization, bounded Upstash fan-out, and lifecycle cleanup in one emitted module
import { file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";
import * as v from "./versions.js";

function realtimeImplementationContent(mode: ProjectMode): string {
  const envImport = mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server";
  return `// @allow-long 620: authorized local and multi-instance realtime fan-out, presence, typing, and session revalidation
import { env } from "${envImport}";
import { randomUUID } from "node:crypto";

type EventType = "message" | "typing" | "presence" | "read";

export type MessagingRealtimeEvent =
  | { type: "message"; conversationId: string; messageId: string; userId: string; timestamp: number }
  | { type: "read"; conversationId: string; messageId: string; userId: string; timestamp: number }
  | { type: "typing"; conversationId: string; userId: string; isTyping: boolean; timestamp: number };

export type RealtimeEvent =
  | MessagingRealtimeEvent
  | { type: "presence"; conversationId: string; userId: string; online: boolean; timestamp: number };

type Handler = (event: RealtimeEvent) => void;
interface AuthorizedHandler {
  active: boolean;
  userId: string;
  conversationId: string;
  authorizeConversation: (conversationId: string, userId: string) => Promise<boolean>;
  authorizationInFlight?: Promise<boolean>;
  authorizationTimer?: ReturnType<typeof setInterval>;
  handler: Handler;
  revoke: () => void;
}

const topics = new Map<string, Set<AuthorizedHandler>>();
const presence = new Map<string, Map<string, { online: boolean; lastSeen: number }>>();
const operationGrants = new Map<string, Map<string, number>>();
const activeSubscriptionsByOwner = new Map<string, number>();
const OPERATION_GRANT_MS = 10_000;
export const MAX_REALTIME_SUBSCRIPTIONS_PER_OWNER = 32;
export const REALTIME_AUTHORIZATION_RECHECK_MS = 10_000;
export const REALTIME_AUTHORIZATION_TIMEOUT_MS = 5_000;
const REDIS_REQUEST_TIMEOUT_MS = 10_000;
const REDIS_STREAM_IDLE_TIMEOUT_MS = 75_000;
const REDIS_CHANNEL = "ghostinit-realtime:" + encodeURIComponent(env.BETTER_AUTH_URL || "default");
const realtimeInstanceId = randomUUID();
const seenRedisEvents = new Map<string, number>();
const SEEN_EVENT_TTL_MS = 5 * 60 * 1000;

let heartbeat: ReturnType<typeof setInterval> | undefined;
let redisSubscriberReady: Promise<void> | undefined;
let redisSubscriberAbort: AbortController | undefined;
let redisSubscriberTask: Promise<void> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIpv4Loopback(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((part) => {
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255 && String(value) === part;
  });
}

function isRedisLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || isIpv4Loopback(hostname);
}

function redisConfig(): { url: string; token: string } | null {
  const rawUrl = env.UPSTASH_REDIS_REST_URL;
  const rawToken = env.UPSTASH_REDIS_REST_TOKEN;
  const urlConfigured = Boolean(rawUrl && !rawUrl.startsWith("REPLACE_WITH"));
  const tokenConfigured = Boolean(rawToken && !rawToken.startsWith("REPLACE_WITH"));
  if (!urlConfigured && !tokenConfigured) return null;
  if (!urlConfigured || !tokenConfigured || !rawUrl || !rawToken) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together");
  }
  if (rawUrl !== rawUrl.trim() || rawToken !== rawToken.trim()) {
    throw new Error("Upstash Redis credentials must not contain surrounding whitespace");
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (cause) {
    throw new Error("UPSTASH_REDIS_REST_URL must be a valid HTTPS or loopback URL", { cause });
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isRedisLoopback(parsed.hostname)))
  ) {
    throw new Error("UPSTASH_REDIS_REST_URL must be an HTTPS origin or a loopback HTTP development origin");
  }
  return { url: parsed.origin, token: rawToken };
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!isRecord(value)) return false;
  if (
    typeof value.conversationId !== "string" ||
    value.conversationId.length === 0 ||
    typeof value.userId !== "string" ||
    value.userId.length === 0 ||
    typeof value.timestamp !== "number" ||
    !Number.isFinite(value.timestamp)
  ) {
    return false;
  }
  if (value.type === "typing") return typeof value.isTyping === "boolean";
  if (value.type === "presence") return typeof value.online === "boolean";
  if (value.type === "message" || value.type === "read") {
    return typeof value.messageId === "string" && value.messageId.length > 0;
  }
  return false;
}

function grantKey(userId: string): Map<string, number> {
  let grants = operationGrants.get(userId);
  if (!grants) {
    grants = new Map();
    operationGrants.set(userId, grants);
  }
  return grants;
}

function consumeCurrentGrant(userId: string, conversationId: string): boolean {
  const grants = operationGrants.get(userId);
  const expiresAt = grants?.get(conversationId);
  grants?.delete(conversationId);
  if (grants?.size === 0) operationGrants.delete(userId);
  if (!expiresAt || expiresAt <= Date.now()) {
    return false;
  }
  return true;
}

/** Call only after the application service verifies current participation. */
export function authorizeRealtimeConversation(userId: string, conversationId: string): void {
  if (!userId || !conversationId) throw new Error("Authenticated user and conversation are required");
  grantKey(userId).set(conversationId, Date.now() + OPERATION_GRANT_MS);
}

export function revokeRealtimeConversation(userId: string, conversationId: string): void {
  const grants = operationGrants.get(userId);
  grants?.delete(conversationId);
  if (grants?.size === 0) operationGrants.delete(userId);
}

function topicKey(conversationId: string, type?: EventType): string {
  return type ? \`${"${conversationId}:${type}"}\` : conversationId;
}

function authorizationRecheckInterval(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 60_000) {
    throw new Error("Realtime authorization recheck interval must be between 100 and 60000 milliseconds");
  }
  return value;
}

async function boundedSubscriptionAuthorization(
  authorizeConversation: (conversationId: string, userId: string) => Promise<boolean>,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const authorization = Promise.resolve()
    .then(async () => await authorizeConversation(conversationId, userId))
    .catch(() => false);
  const deadline = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), REALTIME_AUTHORIZATION_TIMEOUT_MS);
    timeout.unref?.();
  });
  try {
    return await Promise.race([authorization, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function currentSubscriptionAuthorization(subscription: AuthorizedHandler): Promise<boolean> {
  if (!subscription.active) return false;
  if (subscription.authorizationInFlight) return await subscription.authorizationInFlight;
  const pending = boundedSubscriptionAuthorization(
    subscription.authorizeConversation,
    subscription.conversationId,
    subscription.userId,
  );
  subscription.authorizationInFlight = pending;
  void pending.finally(() => {
    if (subscription.authorizationInFlight === pending) {
      subscription.authorizationInFlight = undefined;
    }
  });
  return await pending;
}

function ensureHeartbeat(): void {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [conversationId, users] of presence.entries()) {
      for (const [userId, info] of users.entries()) {
        if (now - info.lastSeen > 90_000) users.delete(userId);
      }
      if (users.size === 0) presence.delete(conversationId);
    }
    for (const [userId, grants] of operationGrants.entries()) {
      for (const [conversationId, expiresAt] of grants.entries()) {
        if (expiresAt <= now) grants.delete(conversationId);
      }
      if (grants.size === 0) operationGrants.delete(userId);
    }
    for (const [eventId, expiresAt] of seenRedisEvents.entries()) {
      if (expiresAt <= now) seenRedisEvents.delete(eventId);
    }
  }, 60_000);
  heartbeat.unref?.();
}

async function fanOutLocally(event: RealtimeEvent): Promise<void> {
  if (event.type === "presence" || event.type === "typing" || event.type === "message") {
    const userId = event.userId;
    if (userId) {
      let users = presence.get(event.conversationId);
      if (!users) {
        users = new Map();
        presence.set(event.conversationId, users);
      }
      const online =
        event.type === "presence" ? event.online : true;
      if (online) users.set(userId, { online: true, lastSeen: Date.now() });
      else users.delete(userId);
    }
  }
  for (const key of [topicKey(event.conversationId), topicKey(event.conversationId, event.type)]) {
    const subscriptions = topics.get(key);
    if (!subscriptions) continue;
    await Promise.all(
      [...subscriptions].map(async (subscription) => {
        try {
          if (!subscription.active) return;
          const allowed = await currentSubscriptionAuthorization(subscription);
          if (!allowed || !subscription.active) {
            subscription.revoke();
            return;
          }
          subscription.handler(event);
        } catch {
          subscription.revoke();
        }
      }),
    );
    if (subscriptions.size === 0) topics.delete(key);
  }
}

function decodeRedisEnvelope(
  value: unknown,
): { id: string; source: string; event: RealtimeEvent } | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.source !== "string" ||
    !isRealtimeEvent(value.event)
  ) {
    return null;
  }
  return { id: value.id, source: value.source, event: value.event };
}

async function consumeRedisEventLine(line: string): Promise<"subscribed" | "event" | "ignored"> {
  const subscribePrefix = \`data: subscribe,\${REDIS_CHANNEL},\`;
  if (line.startsWith(subscribePrefix)) return "subscribed";
  const prefix = \`data: message,\${REDIS_CHANNEL},\`;
  if (!line.startsWith(prefix)) return "ignored";
  let decoded: unknown;
  try {
    decoded = JSON.parse(line.slice(prefix.length));
  } catch {
    throw new Error("Realtime subscriber received invalid JSON");
  }
  const envelope = decodeRedisEnvelope(decoded);
  if (!envelope) throw new Error("Realtime subscriber received an invalid event envelope");
  if (envelope.source === realtimeInstanceId) return "ignored";
  const seenUntil = seenRedisEvents.get(envelope.id);
  if (seenUntil && seenUntil > Date.now()) return "ignored";
  seenRedisEvents.set(envelope.id, Date.now() + SEEN_EVENT_TTL_MS);
  await fanOutLocally(envelope.event);
  return "event";
}

async function consumeRedisStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onSubscribed: () => void,
): Promise<void> {
  const reader = body.getReader();
  const abortStream = () => {
    void reader.cancel("Realtime subscriber aborted").catch(() => undefined);
  };
  signal.addEventListener("abort", abortStream, { once: true });
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (!signal.aborted) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Realtime subscriber stream exceeded its idle deadline"));
          void reader.cancel("Realtime subscriber stream idle timeout").catch(() => undefined);
        }, REDIS_STREAM_IDLE_TIMEOUT_MS);
        timeout.unref?.();
      });
      const result = await (async () => {
        try {
          return await Promise.race([reader.read(), deadline]);
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      })();
      const { done, value } = result;
      if (done) {
        if (!signal.aborted) throw new Error("Realtime subscriber stream ended unexpectedly");
        return;
      }
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\\r?\\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if ((await consumeRedisEventLine(line)) === "subscribed") onSubscribed();
      }
    }
  } finally {
    signal.removeEventListener("abort", abortStream);
    reader.releaseLock();
  }
}

async function waitForReconnect(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, delayMs);
    timeout.unref?.();
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function superviseRedisSubscriber(
  config: { url: string; token: string },
  signal: AbortSignal,
  onReady: () => void,
  onInitialError: (error: Error) => void,
): Promise<void> {
  let acknowledged = false;
  let retryDelayMs = 250;
  while (!signal.aborted) {
    const connection = new AbortController();
    const abortConnection = () => connection.abort();
    signal.addEventListener("abort", abortConnection, { once: true });
    let requestTimedOut = false;
    const requestDeadline = setTimeout(() => {
      requestTimedOut = true;
      connection.abort();
    }, REDIS_REQUEST_TIMEOUT_MS);
    requestDeadline.unref?.();
    try {
      const response = await fetch(
        \`\${config.url}/subscribe/\${encodeURIComponent(REDIS_CHANNEL)}\`,
        {
          method: "POST",
          headers: {
            Authorization: \`Bearer \${config.token}\`,
            Accept: "text/event-stream",
          },
          signal: connection.signal,
        },
      );
      if (!response.ok || !response.body) {
        throw new Error(\`Realtime subscribe failed with status \${response.status}\`);
      }
      await consumeRedisStream(response.body, connection.signal, () => {
        clearTimeout(requestDeadline);
        retryDelayMs = 250;
        if (!acknowledged) {
          acknowledged = true;
          onReady();
        }
      });
      if (requestTimedOut) throw new Error("Realtime subscribe request exceeded its deadline");
    } catch (error) {
      if (signal.aborted) return;
      const failure = requestTimedOut
        ? new Error("Realtime subscribe request exceeded its deadline", { cause: error })
        : error instanceof Error
          ? error
          : new Error(String(error));
      if (!acknowledged) {
        onInitialError(failure);
        return;
      }
      await waitForReconnect(signal, retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, 5_000);
    } finally {
      clearTimeout(requestDeadline);
      signal.removeEventListener("abort", abortConnection);
      connection.abort();
    }
  }
}

export async function startRealtimeSubscriber(): Promise<void> {
  const config = redisConfig();
  if (!config) return;
  if (redisSubscriberReady) return await redisSubscriberReady;

  const controller = new AbortController();
  redisSubscriberAbort = controller;
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  redisSubscriberReady = ready;
  const task = superviseRedisSubscriber(
    config,
    controller.signal,
    () => resolveReady?.(),
    (error) => rejectReady?.(error),
  );
  redisSubscriberTask = task;
  void task.finally(() => {
    if (redisSubscriberTask === task) redisSubscriberTask = undefined;
  });
  try {
    await ready;
  } catch (error) {
    controller.abort();
    if (redisSubscriberAbort === controller) redisSubscriberAbort = undefined;
    if (redisSubscriberReady === ready) redisSubscriberReady = undefined;
    throw error;
  }
}

async function publishRedis(event: RealtimeEvent): Promise<void> {
  const config = redisConfig();
  if (!config) return;
  const envelope = JSON.stringify({ id: randomUUID(), source: realtimeInstanceId, event });
  const controller = new AbortController();
  let requestTimedOut = false;
  const deadline = setTimeout(() => {
    requestTimedOut = true;
    controller.abort();
  }, REDIS_REQUEST_TIMEOUT_MS);
  deadline.unref?.();
  try {
    const response = await fetch(\`\${config.url}/pipeline\`, {
      method: "POST",
      headers: { Authorization: \`Bearer \${config.token}\`, "Content-Type": "application/json" },
      body: JSON.stringify([["PUBLISH", REDIS_CHANNEL, envelope]]),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(\`Realtime publish failed with status \${response.status}\`);
    const result: unknown = await response.json();
    const command = Array.isArray(result) ? result[0] : undefined;
    const commandError = isRecord(command) && typeof command.error === "string" ? command.error : null;
    if (!isRecord(command) || commandError || typeof command.result !== "number") {
      throw new Error(commandError ?? "Realtime publish returned invalid data");
    }
  } catch (error) {
    if (requestTimedOut) {
      throw new Error("Realtime publish request exceeded its deadline", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Application output operation. The application service verifies the actor;
 * each websocket recipient is independently re-authorized before delivery.
 */
export async function publish(conversationId: string, event: RealtimeEvent): Promise<void> {
  ensureHeartbeat();
  if (!conversationId || event.conversationId !== conversationId) {
    throw new Error("Realtime event conversation mismatch");
  }
  await startRealtimeSubscriber().catch(() => undefined);
  await publishRedis(event);
  await fanOutLocally(event);
}

export async function subscribeAuthorized(
  userId: string,
  conversationId: string,
  authorizeConversation: (conversationId: string, userId: string) => Promise<boolean>,
  handler: Handler,
  type?: EventType,
  subscriptionOwnerId = userId,
  onRevoked?: () => void,
  authorizationRecheckMs = REALTIME_AUTHORIZATION_RECHECK_MS,
): Promise<() => void> {
  ensureHeartbeat();
  await startRealtimeSubscriber();
  if (!(await boundedSubscriptionAuthorization(authorizeConversation, conversationId, userId))) {
    throw new Error("Conversation access denied");
  }
  const recheckMs = authorizationRecheckInterval(authorizationRecheckMs);
  const activeSubscriptions = activeSubscriptionsByOwner.get(subscriptionOwnerId) ?? 0;
  if (activeSubscriptions >= MAX_REALTIME_SUBSCRIPTIONS_PER_OWNER) {
    throw new Error("Realtime subscription limit reached");
  }
  activeSubscriptionsByOwner.set(subscriptionOwnerId, activeSubscriptions + 1);
  const key = topicKey(conversationId, type);
  let subscriptions = topics.get(key);
  if (!subscriptions) {
    subscriptions = new Set();
    topics.set(key, subscriptions);
  }
  const cleanup = (revoked: boolean): void => {
    if (!subscription.active) return;
    subscription.active = false;
    if (subscription.authorizationTimer) clearInterval(subscription.authorizationTimer);
    subscriptions?.delete(subscription);
    if (subscriptions?.size === 0) topics.delete(key);
    const remaining = (activeSubscriptionsByOwner.get(subscriptionOwnerId) ?? 1) - 1;
    if (remaining <= 0) activeSubscriptionsByOwner.delete(subscriptionOwnerId);
    else activeSubscriptionsByOwner.set(subscriptionOwnerId, remaining);
    if (revoked) {
      try { onRevoked?.(); } catch {}
    }
  };
  const subscription: AuthorizedHandler = {
    active: true,
    userId,
    conversationId,
    authorizeConversation,
    handler,
    revoke: () => cleanup(true),
  };
  subscriptions.add(subscription);
  subscription.authorizationTimer = setInterval(() => {
    void currentSubscriptionAuthorization(subscription).then((allowed) => {
      if (!allowed && subscription.active) subscription.revoke();
    });
  }, recheckMs);
  subscription.authorizationTimer.unref?.();
  return () => cleanup(false);
}

export function getPresenceAuthorized(conversationId: string, userId: string): ReadonlyMap<string, { online: boolean; lastSeen: number }> {
  if (!consumeCurrentGrant(userId, conversationId)) throw new Error("Conversation access denied");
  return new Map(presence.get(conversationId) ?? []);
}

export async function markOnline(conversationId: string, userId: string): Promise<void> {
  if (!consumeCurrentGrant(userId, conversationId)) throw new Error("Conversation access denied");
  await publish(conversationId, {
    type: "presence",
    conversationId,
    userId,
    online: true,
    timestamp: Date.now(),
  });
}

export async function markOffline(conversationId: string, userId: string): Promise<void> {
  if (!consumeCurrentGrant(userId, conversationId)) throw new Error("Conversation access denied");
  await publish(conversationId, {
    type: "presence",
    conversationId,
    userId,
    online: false,
    timestamp: Date.now(),
  });
}

export async function sendTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
  if (!consumeCurrentGrant(userId, conversationId)) throw new Error("Conversation access denied");
  await publish(conversationId, {
    type: "typing",
    conversationId,
    userId,
    isTyping,
    timestamp: Date.now(),
  });
}

export function clearAll(): void {
  const subscriptions = new Set(
    [...topics.values()].flatMap((topicSubscriptions) => [...topicSubscriptions]),
  );
  for (const subscription of subscriptions) subscription.revoke();
  topics.clear();
  presence.clear();
  operationGrants.clear();
  activeSubscriptionsByOwner.clear();
  seenRedisEvents.clear();
  redisSubscriberAbort?.abort();
  redisSubscriberAbort = undefined;
  redisSubscriberReady = undefined;
  redisSubscriberTask = undefined;
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
}
`;
}

export function realtimePackage(mode: ProjectMode = "monorepo"): TemplateFile[] {
  const implementation = realtimeImplementationContent(mode);
  if (mode === "single") {
    return [file("src/server/realtime/index.ts", implementation)];
  }
  return [
    file(
      "packages/realtime/package.json",
      packageJson({
        name: "@repo/realtime",
        exports: { ".": "./src/index.ts" },
        scripts: {
          typecheck: "tsc --noEmit",
          lint: "oxlint --deny-warnings .",
          format: "oxfmt --write .",
          "format:check": "oxfmt --check .",
        },
        dependencies: { "@repo/config": "workspace:*" },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/realtime/tsconfig.json",
      tsconfig({
        compilerOptions: { types: ["node"], outDir: "./dist", rootDir: "./src", declaration: true },
        include: ["src/**/*"],
      }),
    ),
    file("packages/realtime/src/index.ts", implementation),
  ];
}
