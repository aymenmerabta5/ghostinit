import { file, type TemplateFile } from "../../shared.js";
import type { FrameworkName, ProjectMode } from "../../../lib/addons.js";

function emittedExtension(mode: ProjectMode): string {
  return mode === "monorepo" ? ".js" : "";
}

export function eveLifecycleCallbackFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  const ext = emittedExtension(mode);
  return file(
    `${base}/lifecycle-callback.ts`,
    `import "server-only";
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import { agentAdmissionPort } from "./admission-adapter${ext}";
import {
  isValidEveAdmissionLeaseId,
  isValidEveRuntimeEventId,
  isValidEveRuntimeEventType,
  isValidEveSessionId,
} from "${serviceImport}";

const MAX_CALLBACK_BYTES = 4 * 1024;
const MAX_SIGNATURE_AGE_MS = 5 * 60_000;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type JsonObject = Record<string, unknown>;

function privateResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, code, error: message },
    { status, headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" } },
  );
}

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_CALLBACK_BYTES) return null;
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_CALLBACK_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function authenticated(request: Request, body: Uint8Array, secret: string): boolean {
  const timestamp = request.headers.get("x-ghostinit-eve-timestamp") ?? "";
  const signature = request.headers.get("x-ghostinit-eve-signature") ?? "";
  if (!/^\\d{13}$/.test(timestamp) || !SIGNATURE_PATTERN.test(signature)) return false;
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");
  const expectedBytes = Buffer.from(expected, "ascii");
  const receivedBytes = Buffer.from(signature, "ascii");
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function asObject(bytes: Uint8Array): JsonObject | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export async function handleEveLifecycleCallback(request: Request): Promise<Response> {
  if (request.method !== "POST") return privateResponse(405, "method_not_allowed", "Method not allowed.");
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return privateResponse(415, "unsupported_media_type", "Expected application/json.");
  }
  const secret = configuredSecret();
  if (!secret) return privateResponse(503, "eve_not_configured", "Eve lifecycle authentication is not configured.");
  const bytes = await readBoundedBody(request);
  if (!bytes) return privateResponse(413, "payload_too_large", "Request body is too large.");
  if (!authenticated(request, bytes, secret)) {
    return privateResponse(401, "invalid_lifecycle_signature", "Invalid Eve lifecycle signature.");
  }
  const value = asObject(bytes);
  if (!value) return privateResponse(400, "invalid_lifecycle_event", "Invalid Eve lifecycle event.");
  const eventAtValue = value.eventAt;
  const eventId = value.eventId;
  const eventType = value.eventType;
  const eveSessionId = value.eveSessionId;
  const leaseId = value.leaseId;
  if (
    typeof eventAtValue !== "string" ||
    typeof eventId !== "string" ||
    typeof eventType !== "string" ||
    typeof eveSessionId !== "string" ||
    (leaseId !== undefined && typeof leaseId !== "string") ||
    !isValidEveRuntimeEventId(eventId) ||
    !isValidEveRuntimeEventType(eventType) ||
    !isValidEveSessionId(eveSessionId) ||
    (typeof leaseId === "string" && !isValidEveAdmissionLeaseId(leaseId))
  ) {
    return privateResponse(400, "invalid_lifecycle_event", "Invalid Eve lifecycle event.");
  }
  const eventAt = new Date(eventAtValue);
  const now = new Date();
  // eventAt is Eve-owned metadata. Do not compare it with the application
  // clock: durable steps may run on a host whose wall clock is skewed. Replay
  // protection is the signed request timestamp plus the durable event-id fence.
  if (!Number.isFinite(eventAt.getTime())) {
    return privateResponse(400, "invalid_lifecycle_event", "Invalid Eve lifecycle event timestamp.");
  }
  try {
    await agentAdmissionPort.recordRuntimeEvent({
      eventAt,
      eventId,
      eventType,
      eveSessionId,
      ...(typeof leaseId === "string" ? { leaseId } : {}),
      receivedAt: now,
    });
  } catch {
    return privateResponse(503, "eve_lifecycle_unavailable", "Eve lifecycle storage is unavailable.");
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}
`,
  );
}

export function eveLifecycleCallbackRouteFile(
  mode: ProjectMode,
  framework: FrameworkName,
): TemplateFile {
  if (framework === "tanstack-start") {
    const root = mode === "monorepo" ? "apps/web/src" : "src";
    return file(
      `${root}/routes/api/agent/internal/eve-lifecycle.ts`,
      `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchLifecycleCallback = createServerOnlyFn(
  async (request: Request): Promise<Response> => {
    const { handleEveLifecycleCallback } = await import("@/server/http/eve.server");
    return await handleEveLifecycleCallback(request);
  },
);

export const Route = createFileRoute("/api/agent/internal/eve-lifecycle")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => dispatchLifecycleCallback(request),
    },
  },
});
`,
    );
  }
  const path =
    mode === "monorepo"
      ? "apps/web/src/app/api/agent/internal/eve-lifecycle/route.ts"
      : "src/app/api/agent/internal/eve-lifecycle/route.ts";
  const callbackImport = mode === "monorepo" ? "@repo/api/eve" : "@/server/eve";
  return file(
    path,
    `import { handleEveLifecycleCallback } from "${callbackImport}";

export async function POST(request: Request): Promise<Response> {
  return await handleEveLifecycleCallback(request);
}
`,
  );
}

export function eveAdmissionReconcilerFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  const ext = emittedExtension(mode);
  return file(
    `${base}/admission-reconcile.ts`,
    `import "server-only";
import { Buffer } from "node:buffer";
import { terminalEveEvent, type TerminalEveEvent } from "./admission-stream${ext}";
import type {
  AgentAdmissionPort,
  AgentRuntimeAdmissionPort,
  AgentSessionActor,
} from "${serviceImport}";

const PROXY_USERNAME = "ghostinit-web-proxy";
const MAX_TAIL_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 5_000;

type TailProbe =
  | { readonly state: "active" | "unknown" }
  | { readonly event: TerminalEveEvent; readonly state: "terminal" };

function proxyAuthorization(secret: string): string {
  return "Basic " + Buffer.from(PROXY_USERNAME + ":" + secret, "utf8").toString("base64");
}

async function readBoundedText(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      result += decoder.decode(chunk.value, { stream: true });
      if (result.length > MAX_TAIL_BYTES) {
        await reader.cancel();
        return null;
      }
    }
    result += decoder.decode();
    return result.length <= MAX_TAIL_BYTES ? result : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function probeDurableTail(origin: string, secret: string, sessionId: string): Promise<TailProbe> {
  const url = new URL(
    "/eve/v1/session/" + encodeURIComponent(sessionId) +
      "/stream?startIndex=-1&includeTailIndex=1",
    origin,
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/x-ndjson", Authorization: proxyAuthorization(secret) },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return { state: "unknown" };
  }
  if (!response.ok) return { state: "unknown" };
  const text = await readBoundedText(response);
  if (text === null) return { state: "unknown" };
  const lines = text.split(/\\r?\\n/).filter(Boolean);
  const tail = lines.at(-1);
  if (!tail) return { state: "unknown" };
  const event = terminalEveEvent(tail);
  return event ? { event, state: "terminal" } : { state: "active" };
}

/**
 * Expiry is only a recovery trigger. A bound lease is never reclaimed from its
 * timestamp alone: the private Eve stream must prove a waiting/terminal tail.
 * An unavailable or active runtime is fenced by renewal and admission remains
 * fail-closed, including when no browser ever attached to the public stream.
 */
export async function reconcileExpiredEveAdmissions(input: {
  readonly actor: AgentSessionActor;
  readonly admission: AgentAdmissionPort & AgentRuntimeAdmissionPort;
  readonly origin: string;
  readonly secret: string;
}): Promise<void> {
  const inspectedAt = new Date();
  const expired = await input.admission.listExpiredBoundSessions({
    actor: input.actor,
    inspectedAt,
  });
  const sessions = new Map<string, string[]>();
  for (const entry of expired) {
    const leases = sessions.get(entry.eveSessionId) ?? [];
    leases.push(entry.leaseId);
    sessions.set(entry.eveSessionId, leases);
  }
  for (const [eveSessionId, leaseIds] of sessions) {
    const probe = await probeDurableTail(input.origin, input.secret, eveSessionId);
    if (probe.state === "terminal") {
      const [firstLeaseId] = leaseIds;
      if (probe.event.eventId && firstLeaseId) {
        await input.admission.recordRuntimeEvent({
          eventAt: probe.event.eventAt,
          eventId: probe.event.eventId,
          eventType: probe.event.eventType,
          eveSessionId,
          leaseId: firstLeaseId,
          receivedAt: new Date(),
        });
      }
      for (const leaseId of leaseIds) {
        await input.admission.releaseSession({
          actor: input.actor,
          eveSessionId,
          leaseId,
          releasedAt: new Date(),
        });
      }
      continue;
    }
    await input.admission.touchSession({
      actor: input.actor,
      eveSessionId,
      touchedAt: new Date(),
    });
  }
}
`,
  );
}
