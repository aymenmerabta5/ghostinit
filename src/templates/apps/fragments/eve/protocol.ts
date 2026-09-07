import { file, type TemplateFile } from "../../../shared.js";

export type EvePlatformTarget = "expo" | "desktop";
export type EvePlatformMode = "monorepo" | "single";

export function eveProtocolContent(): string {
  return `export interface EveSessionCursor {
  readonly sessionId: string;
  readonly nextIndex: number;
}

export interface EveInvokeResult {
  readonly message: string;
  readonly session: EveSessionCursor;
  readonly status: "completed" | "waiting";
}

export interface EveTransportRequest {
  readonly body?: string;
  readonly method: "GET" | "POST";
  readonly signal?: AbortSignal;
}

export interface EveTransport {
  request(path: string, input: EveTransportRequest): Promise<Response>;
}

export interface EveInvokeOptions {
  readonly onText?: (text: string) => void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

type JsonObject = Record<string, unknown>;
type EveEvent = { readonly type: string; readonly data: JsonObject };

const MAX_MESSAGE_LENGTH = 64 * 1024;
const MAX_EVENT_BATCH_BYTES = 2 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export class EveClientError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "EveClientError";
    this.status = status;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new EveClientError("The Eve request was cancelled.");
}

async function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new EveClientError("The Eve request was cancelled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

async function responseError(response: Response): Promise<EveClientError> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_EVENT_BATCH_BYTES) {
    return new EveClientError("The Eve service returned an oversized error.", response.status);
  }
  const source = await response.text();
  if (source.length > MAX_EVENT_BATCH_BYTES) {
    return new EveClientError("The Eve service returned an oversized error.", response.status);
  }
  try {
    const value: unknown = JSON.parse(source);
    if (isObject(value)) {
      const message = text(value.error) ?? text(value.message);
      if (message) return new EveClientError(message, response.status);
    }
  } catch {
    // Non-JSON upstream failures use the stable status fallback below.
  }
  return new EveClientError("Eve request failed with status " + String(response.status) + ".", response.status);
}

async function expectSuccess(response: Response): Promise<Response> {
  if (!response.ok) throw await responseError(response);
  return response;
}

async function acceptedSessionId(response: Response, fallback: string | null): Promise<string> {
  const source = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new EveClientError("The Eve service returned invalid JSON.", response.status);
  }
  const fromBody = isObject(value) ? text(value.sessionId) : null;
  const candidate = fallback ?? fromBody ?? response.headers.get("x-eve-session-id");
  if (!candidate || !SESSION_ID_PATTERN.test(candidate)) {
    throw new EveClientError("The Eve service omitted a valid session id.", response.status);
  }
  return candidate;
}

function parseEvents(source: string): EveEvent[] {
  if (source.length > MAX_EVENT_BATCH_BYTES) {
    throw new EveClientError("The Eve event batch is too large.");
  }
  const events: EveEvent[] = [];
  for (const line of source.split("\\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new EveClientError("The Eve event stream contained invalid JSON.");
    }
    if (!isObject(value) || typeof value.type !== "string") {
      throw new EveClientError("The Eve event stream contained an invalid event.");
    }
    events.push({ type: value.type, data: isObject(value.data) ? value.data : {} });
  }
  return events;
}

function failureMessage(event: EveEvent): string {
  return text(event.data.message) ?? text(event.data.error) ?? "The Eve session failed.";
}

export function createEveClient(transport: EveTransport) {
  return {
    async invoke(
      message: string,
      previous: EveSessionCursor | null = null,
      options: EveInvokeOptions = {},
    ): Promise<EveInvokeResult> {
      const normalized = message.trim();
      if (!normalized) throw new EveClientError("Enter a message for Eve.");
      if (normalized.length > MAX_MESSAGE_LENGTH) throw new EveClientError("The Eve message is too large.");
      if (previous && !SESSION_ID_PATTERN.test(previous.sessionId)) {
        throw new EveClientError("The saved Eve session id is invalid.");
      }
      if (previous && (!Number.isSafeInteger(previous.nextIndex) || previous.nextIndex < 0)) {
        throw new EveClientError("The saved Eve stream cursor is invalid.");
      }

      throwIfAborted(options.signal);
      const postPath = previous
        ? "/api/agent/eve/v1/session/" + encodeURIComponent(previous.sessionId)
        : "/api/agent/eve/v1/session";
      const accepted = await expectSuccess(
        await transport.request(postPath, {
          body: JSON.stringify({ message: normalized }),
          method: "POST",
          signal: options.signal,
        }),
      );
      const sessionId = await acceptedSessionId(accepted, previous?.sessionId ?? null);
      let nextIndex = previous?.nextIndex ?? 0;
      let assistantMessage = "";
      const deadline = Date.now() + (options.timeoutMs ?? 120_000);

      for (;;) {
        throwIfAborted(options.signal);
        if (Date.now() > deadline) throw new EveClientError("Timed out waiting for Eve.");
        const streamPath =
          "/api/agent/eve/v1/session/" +
          encodeURIComponent(sessionId) +
          "/stream?startIndex=" +
          String(nextIndex) +
          "&includeTailIndex=1";
        const stream = await expectSuccess(
          await transport.request(streamPath, { method: "GET", signal: options.signal }),
        );
        const declared = Number(stream.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_EVENT_BATCH_BYTES) {
          throw new EveClientError("The Eve event batch is too large.", stream.status);
        }
        const events = parseEvents(await stream.text());
        nextIndex += events.length;

        for (const event of events) {
          if (event.type === "message.appended") {
            assistantMessage =
              text(event.data.message) ??
              (assistantMessage + (text(event.data.messageDelta) ?? ""));
            options.onText?.(assistantMessage);
          } else if (event.type === "message.completed") {
            assistantMessage = text(event.data.message) ?? assistantMessage;
            options.onText?.(assistantMessage);
          } else if (event.type === "session.failed" || event.type === "turn.failed") {
            throw new EveClientError(failureMessage(event));
          } else if (event.type === "session.completed" || event.type === "session.waiting") {
            return {
              message: assistantMessage,
              session: { sessionId, nextIndex },
              status: event.type === "session.completed" ? "completed" : "waiting",
            };
          }
        }
        await pause(250, options.signal);
      }
    },
  };
}
`;
}

export function eveProtocolAcceptanceContent(protocolImport: string): string {
  return `import { describe, expect, test } from "bun:test";
import { createEveClient, type EveTransport } from "${protocolImport}";

describe("Eve platform client", () => {
  test("invokes only the authenticated application facade and consumes a bounded event batch", async () => {
    const requests: Array<{ path: string; body?: string; method: string }> = [];
    const transport: EveTransport = {
      async request(path, input) {
        requests.push({ path, body: input.body, method: input.method });
        if (input.method === "POST") {
          return Response.json(
            { ok: true, sessionId: "wrun_platform" },
            { status: 202, headers: { "x-eve-session-id": "wrun_platform" } },
          );
        }
        const body = [
          { type: "message.received", data: { message: "Hello" } },
          { type: "message.appended", data: { messageDelta: "Hi", message: "Hi" } },
          { type: "message.completed", data: { message: "Hi there" } },
          { type: "session.waiting", data: {} },
        ].map((event) => JSON.stringify(event)).join("\\n") + "\\n";
        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/x-ndjson", "x-eve-stream-tail-index": "3" },
        });
      },
    };

    const result = await createEveClient(transport).invoke("Hello", null, { timeoutMs: 1_000 });
    expect(result).toEqual({
      message: "Hi there",
      session: { sessionId: "wrun_platform", nextIndex: 4 },
      status: "waiting",
    });
    expect(requests[0]).toEqual({
      path: "/api/agent/eve/v1/session",
      body: JSON.stringify({ message: "Hello" }),
      method: "POST",
    });
    expect(requests[1]?.path).toBe(
      "/api/agent/eve/v1/session/wrun_platform/stream?startIndex=0&includeTailIndex=1",
    );
    expect(requests.every(({ path }) => path.startsWith("/api/agent/eve/v1/"))).toBe(true);
  });
});
`;
}

export function eveProtocolFile(target: EvePlatformTarget, mode: EvePlatformMode): TemplateFile {
  const path =
    target === "expo"
      ? mode === "monorepo"
        ? "apps/mobile/src/lib/eve-protocol.ts"
        : "src/lib/eve-protocol.ts"
      : mode === "monorepo"
        ? "apps/desktop/src/renderer/lib/eve-protocol.ts"
        : "src/renderer/lib/eve-protocol.ts";
  return file(path, eveProtocolContent());
}

export function eveProtocolAcceptanceFile(
  target: EvePlatformTarget,
  mode: EvePlatformMode,
): TemplateFile {
  const root =
    target === "expo"
      ? mode === "monorepo"
        ? "apps/mobile/"
        : ""
      : mode === "monorepo"
        ? "apps/desktop/"
        : "";
  const protocolImport =
    target === "expo" ? "../src/lib/eve-protocol" : "../src/renderer/lib/eve-protocol";
  return file(`${root}tests/eve-client.test.ts`, eveProtocolAcceptanceContent(protocolImport));
}
