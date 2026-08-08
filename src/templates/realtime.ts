import { file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export function realtimePackage(): TemplateFile[] {
  return [
    file(
      "packages/realtime/package.json",
      packageJson({
        name: "@repo/realtime",
        exports: { ".": "./src/index.ts" },
        scripts: {
          typecheck: "tsc --noEmit",
          lint: "oxlint .",
          "format:check": "oxfmt --check .",
        },
        dependencies: {
          "@repo/config": "workspace:*",
        },
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
    file(
      "packages/realtime/src/index.ts",
      `// @allow-long 280: realtime pub/sub + presence/typing for postgres DM messaging (WS ephemeral + optional Redis fan-out)
import { env } from "@repo/config";

type EventType = "message" | "typing" | "presence" | "read";
export interface RealtimeEvent {
  type: EventType;
  conversationId: string;
  payload: unknown;
  timestamp: number;
}

type Handler = (event: RealtimeEvent) => void;

// In-memory fan-out (single instance). For multi-instance, integrate Upstash Redis when cache=redis
const topics = new Map<string, Set<Handler>>();
const presence = new Map<string, Map<string, { online: boolean; lastSeen: number }>>();

// Heartbeat cleanup every 60s
let heartbeat: ReturnType<typeof setInterval> | undefined;
function ensureHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    const now = Date.now();
    for (const [convId, users] of presence.entries()) {
      for (const [userId, info] of users.entries()) {
        if (now - info.lastSeen > 90_000) {
          users.delete(userId);
          publish(convId, { type: "presence", conversationId: convId, payload: { userId, online: false }, timestamp: now });
        }
      }
      if (users.size === 0) presence.delete(convId);
    }
  }, 60_000);
  if (heartbeat && typeof (heartbeat as unknown as { unref?: () => void }).unref === "function") {
    (heartbeat as unknown as { unref: () => void }).unref();
  }
}

function topicKey(conversationId: string, type?: EventType): string {
  return type ? \`\${conversationId}:\${type}\` : conversationId;
}

export function publish(conversationId: string, event: RealtimeEvent): void {
  ensureHeartbeat();
  // Track presence on message/typing/presence events
  if (event.type === "presence" || event.type === "typing" || event.type === "message") {
    const payload = event.payload as { userId?: string; online?: boolean } | undefined;
    const userId = payload?.userId as string | undefined;
    if (userId) {
      let convPresence = presence.get(conversationId);
      if (!convPresence) {
        convPresence = new Map();
        presence.set(conversationId, convPresence);
      }
      if (event.type === "presence") {
        const online = (payload as { online?: boolean }).online ?? true;
        convPresence.set(userId, { online, lastSeen: Date.now() });
      } else {
        convPresence.set(userId, { online: true, lastSeen: Date.now() });
      }
    }
  }
  const keys = [topicKey(conversationId), topicKey(conversationId, event.type)];
  for (const key of keys) {
    const handlers = topics.get(key);
    if (handlers) {
      for (const h of [...handlers]) {
        try { h(event); } catch {}
      }
    }
  }
  // Optional Redis fan-out when UPSTASH_REDIS_* set (REST publish, not pub/sub — best-effort cross-instance)
  // Keep sync for latency; do not await
  try {
    const url = (env as unknown as { UPSTASH_REDIS_REST_URL?: string }).UPSTASH_REDIS_REST_URL;
    if (url && url !== "REPLACE_WITH_UPSTASH_REDIS_REST_URL" && env.UPSTASH_REDIS_REST_TOKEN) {
      // Fire-and-forget via fetch if available
      const maybeFetch = (globalThis as unknown as { fetch?: typeof fetch }).fetch;
      if (maybeFetch) {
        const token = env.UPSTASH_REDIS_REST_TOKEN;
        const channel = \`realtime:\${conversationId}\`;
        const body = JSON.stringify(["PUBLISH", channel, JSON.stringify(event)]);
        void maybeFetch(\`\${url}/pipeline\`, {
          method: "POST",
          headers: { Authorization: \`Bearer \${token}\`, "Content-Type": "application/json" },
          body,
        }).catch(() => {});
      }
    }
  } catch {}
}

export function subscribe(conversationId: string, handler: Handler): () => void;
export function subscribe(conversationId: string, type: EventType, handler: Handler): () => void;
export function subscribe(conversationId: string, typeOrHandler: EventType | Handler, maybeHandler?: Handler): () => void {
  ensureHeartbeat();
  let type: EventType | undefined;
  let handler: Handler;
  if (typeof typeOrHandler === "function") {
    handler = typeOrHandler;
  } else {
    type = typeOrHandler;
    handler = maybeHandler as Handler;
  }
  const key = topicKey(conversationId, type);
  let set = topics.get(key);
  if (!set) {
    set = new Set();
    topics.set(key, set);
  }
  set.add(handler);
  return () => {
    const s = topics.get(key);
    if (s) {
      s.delete(handler);
      if (s.size === 0) topics.delete(key);
    }
  };
}

export function getPresence(conversationId: string): Map<string, { online: boolean; lastSeen: number }> {
  return presence.get(conversationId) ?? new Map();
}

export function markOnline(conversationId: string, userId: string): void {
  publish(conversationId, { type: "presence", conversationId, payload: { userId, online: true }, timestamp: Date.now() });
}

export function markOffline(conversationId: string, userId: string): void {
  publish(conversationId, { type: "presence", conversationId, payload: { userId, online: false }, timestamp: Date.now() });
}

export function sendTyping(conversationId: string, userId: string, isTyping: boolean): void {
  publish(conversationId, { type: "typing", conversationId, payload: { userId, isTyping }, timestamp: Date.now() });
}

export function clearAll(): void {
  topics.clear();
  presence.clear();
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = undefined;
  }
}
`,
    ),
  ];
}
