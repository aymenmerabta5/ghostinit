import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

export function eveAdmissionLifecycleHookFile(mode: ProjectMode): TemplateFile {
  const path =
    mode === "monorepo"
      ? "apps/eve/agent/hooks/admission-lifecycle.ts"
      : "agent/hooks/admission-lifecycle.ts";
  return file(
    path,
    `import { createHmac } from "node:crypto";
import { defineHook } from "eve/hooks";

const CALLBACK_PATH = "/api/agent/internal/eve-lifecycle";
const CALLBACK_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const TERMINAL_EVENTS = new Set(["session.waiting", "session.failed", "session.completed"]);
const LEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const lastSuccessfulHeartbeat = new Map<string, number>();
const compactingSessions = new Set<string>();

interface LifecycleContext {
  readonly session: {
    readonly id: string;
    readonly auth: {
      readonly current?: { readonly attributes?: unknown } | null;
      readonly initiator?: { readonly attributes?: unknown } | null;
    };
  };
}

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

function callbackOrigin(): string | null {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) return null;
  try {
    const value = new URL(configured);
    const loopback =
      value.hostname === "localhost" ||
      value.hostname === "127.0.0.1" ||
      value.hostname === "[::1]";
    if (
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      (value.protocol !== "https:" && !(value.protocol === "http:" && loopback))
    ) {
      return null;
    }
    return value.origin;
  } catch {
    return null;
  }
}

function admissionLeaseId(ctx: LifecycleContext): string | undefined {
  for (const principal of [ctx.session.auth.current, ctx.session.auth.initiator]) {
    const attributes = principal?.attributes;
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) continue;
    const candidate = Reflect.get(attributes, "eveAdmissionLeaseId");
    if (typeof candidate === "string" && LEASE_ID_PATTERN.test(candidate)) return candidate;
  }
  return undefined;
}

async function notifyApplication(event: {
  readonly meta: { readonly at: string; readonly id: string };
  readonly type: string;
}, ctx: LifecycleContext): Promise<void> {
  const origin = callbackOrigin();
  const secret = configuredSecret();
  if (!origin || !secret || typeof event.meta.id !== "string") return;
  const terminal = TERMINAL_EVENTS.has(event.type);
  if (event.type === "compaction.requested") compactingSessions.add(ctx.session.id);
  const now = Date.now();
  const previous = lastSuccessfulHeartbeat.get(ctx.session.id) ?? 0;
  if (
    !terminal &&
    event.type !== "session.started" &&
    event.type !== "compaction.requested" &&
    now - previous < HEARTBEAT_INTERVAL_MS
  ) {
    return;
  }

  const body = JSON.stringify({
    eventAt: event.meta.at,
    eventId: event.meta.id,
    eventType: event.type,
    eveSessionId: ctx.session.id,
    // Eve control routes do not accept forwardedPrincipal. During compaction,
    // the prior turn's caller snapshot can therefore contain a stale lease.
    // Omit it and let the application select only its already-bound compact
    // lease after observing compaction.requested.
    leaseId: compactingSessions.has(ctx.session.id) ? undefined : admissionLeaseId(ctx),
  });
  const timestamp = String(now);
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");
  try {
    const response = await fetch(new URL(CALLBACK_PATH, origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GhostInit-Eve-Signature": signature,
        "X-GhostInit-Eve-Timestamp": timestamp,
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("The application rejected the Eve lifecycle callback");
    if (terminal) lastSuccessfulHeartbeat.delete(ctx.session.id);
    else lastSuccessfulHeartbeat.set(ctx.session.id, now);
  } finally {
    if (terminal) compactingSessions.delete(ctx.session.id);
  }
}

export default defineHook({
  events: {
    async "*"(event, ctx) {
      // The callback is primary lifecycle authority, but callback downtime must
      // not fail model work. The application fail-closes expired bound leases
      // by inspecting Eve's authenticated durable stream tail before admission.
      await notifyApplication(event, ctx).catch(() => undefined);
    },
  },
});
`,
  );
}
