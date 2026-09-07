// @allow-long 430: one emitted facade keeps auth, admission, bounded proxying, ownership, and stream handling auditable together
import { file, type TemplateFile } from "../../shared.js";
import type { FrameworkName, ProjectMode } from "../../../lib/addons.js";

function emittedExtension(mode: ProjectMode): string {
  return mode === "monorepo" ? ".js" : "";
}

export function eveFacadeFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  const ext = emittedExtension(mode);
  const serviceImport = mode === "monorepo" ? "@repo/services/eve" : "@/server/services/eve";
  return file(
    `${base}/facade.ts`,
    `// @allow-long 370: authenticated Eve proxy keeps admission, bounded requests, ownership claims, and streaming in one security boundary
import "server-only";
import { Buffer } from "node:buffer";
import { agentAdmissionPort } from "./admission-adapter${ext}";
import { reconcileExpiredEveAdmissions } from "./admission-reconcile${ext}";
import { agentSessionOwnershipPort } from "./ownership-adapter${ext}";
import { resolveAuthenticatedEveActor, type AuthenticatedEveActor } from "./actor${ext}";
import {
  MAX_EVE_JSON_BYTES,
  classifyEveFacadeRequest,
  configuredBrowserOrigin,
  hasTrustedBrowserOrigin,
  type EveFacadeRoute,
} from "./policy${ext}";
import {
  isPaidAgentOperation,
  isValidEveSessionId,
  type AgentAdmissionDecision,
  type AgentSessionActor,
} from "${serviceImport}";

const PROXY_USERNAME = "ghostinit-web-proxy";
const FORWARDED_RESPONSE_HEADERS = [
  "cache-control",
  "content-type",
  "pragma",
  "x-accel-buffering",
  "x-eve-session-id",
  "x-eve-stream-format",
  "x-eve-stream-tail-index",
  "x-eve-stream-version",
] as const;

type JsonObject = Record<string, unknown>;
type BodyResult = { readonly ok: true; readonly value: JsonObject } | { readonly ok: false; readonly response: Response };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function privateResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, code, error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        Vary: "Cookie, Origin",
      },
    },
  );
}

function admissionDeniedResponse(
  decision: Exclude<AgentAdmissionDecision, { readonly ok: true }>,
): Response {
  const response =
    decision.code === "EVE_ENTITLEMENT_UNSUPPORTED"
      ? privateResponse(501, "eve_entitlement_unsupported", "Eve requires an application entitlement provider.")
      : decision.code === "EVE_ENTITLEMENT_REQUIRED"
        ? privateResponse(402, "eve_entitlement_required", "An active plan is required to use Eve.")
        : decision.code === "EVE_RATE_LIMITED"
          ? privateResponse(429, "eve_rate_limited", "Too many Eve operations were requested.")
          : privateResponse(429, "eve_concurrency_limited", "Another Eve operation is still active.");
  if (decision.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(decision.retryAfterSeconds));
  }
  return response;
}

function configuredInternalSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

function safeUpstreamOrigin(): string | null {
  const configured =
    process.env.EVE_NEXT_PRODUCTION_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (!configured) return null;
  try {
    const value = new URL(configured);
    const loopback = value.hostname === "localhost" || value.hostname === "127.0.0.1" || value.hostname === "[::1]";
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

function asOwnershipActor(actor: AuthenticatedEveActor): AgentSessionActor {
  return {
    authSessionId: actor.authSessionId,
    emailVerified: actor.emailVerified,
    organizationId: actor.organizationId,
    teamId: actor.teamId,
    userId: actor.userId,
  };
}

function forwardedPrincipal(
  actor: AuthenticatedEveActor,
  issuer: string,
  admissionLeaseId?: string,
) {
  return {
    attributes: {
      email: actor.email,
      role: actor.role,
      ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
      ...(actor.teamId ? { teamId: actor.teamId } : {}),
      ...(admissionLeaseId ? { eveAdmissionLeaseId: admissionLeaseId } : {}),
    },
    authenticator: "better-auth",
    issuer,
    principalId: actor.userId,
    principalType: "user",
  } as const;
}

async function readBoundedJson(request: Request): Promise<BodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_EVE_JSON_BYTES) {
      return { ok: false, response: privateResponse(413, "payload_too_large", "Request body is too large.") };
    }
  }
  const contentType = request.headers.get("content-type");
  if (request.body !== null && contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return { ok: false, response: privateResponse(415, "unsupported_media_type", "Expected application/json.") };
  }
  if (request.body === null) return { ok: true, value: {} };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_EVE_JSON_BYTES) {
        await reader.cancel();
        return { ok: false, response: privateResponse(413, "payload_too_large", "Request body is too large.") };
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  } catch {
    return { ok: false, response: privateResponse(400, "invalid_json", "Invalid UTF-8 JSON body.") };
  }
  if (!source) return { ok: true, value: {} };
  try {
    const value: unknown = JSON.parse(source);
    if (!isJsonObject(value)) {
      return { ok: false, response: privateResponse(400, "invalid_json", "Expected a JSON object.") };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, response: privateResponse(400, "invalid_json", "Invalid JSON body.") };
  }
}

function upstreamHeaders(secret: string): Headers {
  const headers = new Headers({
    Accept: "application/json, application/x-ndjson",
    Authorization: "Basic " + Buffer.from(PROXY_USERNAME + ":" + secret, "utf8").toString("base64"),
    "Content-Type": "application/json",
  });
  return headers;
}

function browserResponse(upstream: Response, body?: BodyInit | null): Response {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("Cache-Control", upstream.headers.get("cache-control") ?? "private, no-store");
  headers.set("Vary", "Cookie, Origin");
  return new Response(body === undefined ? upstream.body : body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function dispatchUpstream(
  route: EveFacadeRoute,
  origin: string,
  secret: string,
  request: Request,
  body?: JsonObject,
): Promise<Response> {
  const url = new URL(route.upstreamPath + route.search, origin);
  try {
    return await fetch(url, {
      method: route.method,
      headers: upstreamHeaders(secret),
      ...(route.method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
  } catch {
    return privateResponse(502, "eve_unavailable", "The Eve service is unavailable.");
  }
}

async function bestEffortReset(sessionId: string, origin: string, secret: string): Promise<void> {
  if (!isValidEveSessionId(sessionId)) return;
  try {
    await fetch(new URL("/eve/v1/session/" + encodeURIComponent(sessionId) + "/reset", origin), {
      method: "POST",
      headers: upstreamHeaders(secret),
      body: JSON.stringify({ reason: "ownership_claim_failed" }),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    // The session id is never returned when cleanup fails; an operator can
    // reconcile the orphan from server-side audit logs.
  }
}

function sessionIdFromCreate(response: Response, value: unknown): string | null {
  const fromHeader = response.headers.get("x-eve-session-id");
  const fromBody =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Reflect.get(value, "sessionId")
      : null;
  const candidate = typeof fromBody === "string" ? fromBody : fromHeader;
  return candidate && isValidEveSessionId(candidate) ? candidate : null;
}

export async function handleEveFacadeRequest(request: Request): Promise<Response> {
  const decision = classifyEveFacadeRequest(request);
  if (!decision.ok) {
    return privateResponse(decision.status, decision.status === 405 ? "method_not_allowed" : "not_found", decision.status === 405 ? "Method not allowed." : "Not found.");
  }
  const browserOrigin = configuredBrowserOrigin();
  if (!browserOrigin) return privateResponse(503, "auth_not_configured", "Authentication is not configured.");
  if (!hasTrustedBrowserOrigin(request, browserOrigin)) {
    return privateResponse(403, "invalid_origin", "The request origin is not trusted.");
  }

  let actor: AuthenticatedEveActor | null;
  try {
    actor = await resolveAuthenticatedEveActor(new Headers(request.headers));
  } catch {
    return privateResponse(503, "identity_unavailable", "Identity verification is unavailable.");
  }
  if (!actor) return privateResponse(401, "authentication_required", "Sign in to continue.");
  if (!actor.emailVerified) {
    return privateResponse(403, "email_verification_required", "Verify your email address to use Eve.");
  }
  const ownershipActor = asOwnershipActor(actor);

  const secret = configuredInternalSecret();
  if (!secret) return privateResponse(503, "eve_not_configured", "Eve service authentication is not configured.");
  const upstreamOrigin = safeUpstreamOrigin();
  if (!upstreamOrigin) {
    return privateResponse(503, "eve_not_configured", "The Eve service origin is not configured.");
  }

  let admissionLeaseId: string | null = null;
  let retainAdmissionLease = false;
  if (isPaidAgentOperation(decision.route.kind)) {
    let admission: AgentAdmissionDecision;
    try {
      await reconcileExpiredEveAdmissions({
        actor: ownershipActor,
        admission: agentAdmissionPort,
        origin: upstreamOrigin,
        secret,
      });
      admission = await agentAdmissionPort.admit({
        actor: ownershipActor,
        ...(decision.route.sessionId ? { eveSessionId: decision.route.sessionId } : {}),
        operation: decision.route.kind,
        requestedAt: new Date(),
      });
    } catch {
      return privateResponse(503, "eve_admission_unavailable", "Eve admission is unavailable.");
    }
    if (!admission.ok) return admissionDeniedResponse(admission);
    admissionLeaseId = admission.leaseId;
  }

  try {
    if (decision.route.sessionId !== null) {
    let authorized = false;
    try {
      authorized = await agentSessionOwnershipPort.authorize({
        actor: ownershipActor,
        eveSessionId: decision.route.sessionId,
      });
    } catch {
      return privateResponse(503, "ownership_unavailable", "Session authorization is unavailable.");
    }
    if (!authorized) return privateResponse(404, "session_not_found", "Session not found.");
    }

  let body: JsonObject | undefined;
  if (decision.route.method === "POST") {
    const parsed = await readBoundedJson(request);
    if (!parsed.ok) return parsed.response;
    body = { ...parsed.value };
    Reflect.deleteProperty(body, "forwardedPrincipal");
    if (decision.route.kind === "create" || decision.route.kind === "follow") {
      const current = forwardedPrincipal(
        actor,
        browserOrigin,
        admissionLeaseId ?? undefined,
      );
      body.forwardedPrincipal =
        decision.route.kind === "create" ? { current, initiator: current } : { current };
    }
  }

  const upstream = await dispatchUpstream(decision.route, upstreamOrigin, secret, request, body);
  if (
    admissionLeaseId !== null &&
    decision.route.sessionId !== null &&
    upstream.status === 202
  ) {
    // Follow-up and compaction work is asynchronous. The stream's durable
    // session boundary, not this acknowledgement, releases the admission.
    retainAdmissionLease = true;
  }
  if (decision.route.kind === "create" && upstream.ok) {
    const source = await upstream.text();
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      return privateResponse(502, "invalid_eve_response", "The Eve service returned an invalid response.");
    }
    const sessionId = sessionIdFromCreate(upstream, value);
    if (!sessionId) return privateResponse(502, "invalid_eve_response", "The Eve service omitted its session id.");
    try {
      const claim = await agentSessionOwnershipPort.claim({
        actor: ownershipActor,
        createdAt: new Date(),
        eveSessionId: sessionId,
      });
      if (claim === "conflict") {
        return privateResponse(409, "session_ownership_conflict", "The session could not be claimed.");
      }
      if (admissionLeaseId === null) throw new Error("Eve create admission lease is missing");
      await agentAdmissionPort.bindSession({
        actor: ownershipActor,
        boundAt: new Date(),
        eveSessionId: sessionId,
        leaseId: admissionLeaseId,
      });
      retainAdmissionLease = true;
    } catch {
      // A caller-provided operation id may have resumed an older session. Only
      // reset a non-idempotent create, where Eve necessarily minted this id for
      // the request, so cleanup can never retire another owner's conversation.
      if (typeof body?.operationId !== "string") {
        await bestEffortReset(sessionId, upstreamOrigin, secret);
      }
      return privateResponse(503, "ownership_unavailable", "The session could not be claimed.");
    }
    return browserResponse(upstream, source);
  }

  if (decision.route.kind === "reset" && upstream.ok && decision.route.sessionId !== null) {
    try {
      const retired = await agentSessionOwnershipPort.retire({
        actor: ownershipActor,
        eveSessionId: decision.route.sessionId,
        retiredAt: new Date(),
      });
      if (!retired) return privateResponse(409, "session_state_changed", "The session state changed.");
      await agentAdmissionPort
        .releaseSession({
          actor: ownershipActor,
          eveSessionId: decision.route.sessionId,
          releasedAt: new Date(),
        })
        .catch(() => undefined);
    } catch {
      return privateResponse(503, "ownership_unavailable", "The session retirement could not be recorded.");
    }
  }
    return browserResponse(upstream);
  } finally {
    if (admissionLeaseId !== null && !retainAdmissionLease) {
      await agentAdmissionPort
        .release({ actor: ownershipActor, leaseId: admissionLeaseId, releasedAt: new Date() })
        .catch(() => undefined);
    }
  }
}
`,
  );
}

export function eveFacadeIndexFile(mode: ProjectMode): TemplateFile {
  const base = mode === "monorepo" ? "packages/api/src/eve" : "src/server/eve";
  return file(
    `${base}/index.ts`,
    `export { handleEveFacadeRequest } from "./facade${emittedExtension(mode)}";
export { handleEveLifecycleCallback } from "./lifecycle-callback${emittedExtension(mode)}";
`,
  );
}

export function eveFacadeRouteFiles(mode: ProjectMode, framework: FrameworkName): TemplateFile[] {
  if (framework === "tanstack-start") {
    const root = mode === "monorepo" ? "apps/web/src" : "src";
    const facadeImport = mode === "monorepo" ? "@repo/api/eve" : "@/server/eve";
    return [
      file(
        `${root}/server/http/eve.server.ts`,
        `import "server-only";
export { handleEveFacadeRequest, handleEveLifecycleCallback } from "${facadeImport}";
`,
      ),
      file(
        `${root}/routes/api/agent/$.ts`,
        `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchEveGet = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { handleEveFacadeRequest } = await import("@/server/http/eve.server");
  return await handleEveFacadeRequest(request);
});

const dispatchEvePost = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { handleEveFacadeRequest } = await import("@/server/http/eve.server");
  return await handleEveFacadeRequest(request);
});

export const Route = createFileRoute("/api/agent/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => dispatchEveGet(request),
      POST: ({ request }: { request: Request }) => dispatchEvePost(request),
    },
  },
});
`,
      ),
    ];
  }
  const path =
    mode === "monorepo"
      ? "apps/web/src/app/api/agent/[...path]/route.ts"
      : "src/app/api/agent/[...path]/route.ts";
  const facadeImport = mode === "monorepo" ? "@repo/api/eve" : "@/server/eve";
  return [
    file(
      path,
      `import { handleEveFacadeRequest } from "${facadeImport}";

export async function GET(request: Request): Promise<Response> {
  return await handleEveFacadeRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return await handleEveFacadeRequest(request);
}
`,
    ),
  ];
}
