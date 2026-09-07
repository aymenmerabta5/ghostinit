import type { DesktopMode } from "./model.js";
import { MAX_ORPC_BODY_BYTES } from "../../api/body-limits.js";

/** Trusted main-process HTTP transport used by the sandboxed desktop renderer. */
export function desktopApiTransportContent(mode: DesktopMode = "monorepo"): string {
  void mode;
  return `import { session } from "electron";
import { env } from "./runtime-config.js";

export type DesktopApiRequest = {
  readonly body: Uint8Array | null;
  readonly headers: [string, string][];
  readonly method: string;
  readonly url: string;
};

export type DesktopApiResponse = {
  readonly body: Uint8Array;
  readonly headers: [string, string][];
  readonly status: number;
  readonly statusText: string;
};

// Match the server oRPC admission bound so the full storage payload can cross IPC.
const MAX_DESKTOP_API_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};
const MAX_DESKTOP_API_HEADERS = 64;
const MAX_DESKTOP_API_HEADER_BYTES = 64 * 1024;
const ALLOWED_DESKTOP_API_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const BLOCKED_RENDERER_HEADERS = new Set([
  "connection",
  "content-length",
  "cookie",
  "host",
  "origin",
  "referer",
  "set-cookie",
  "set-cookie2",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-real-ip",
  "x-ghostinit-native-client",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configuredDesktopApiOrigin(): string {
  const configured = env.DESKTOP_API_URL;
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("The desktop API URL is invalid");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback.has(parsed.hostname)))
  ) {
    throw new Error("The desktop API URL must be HTTPS or a loopback development origin");
  }
  return parsed.origin;
}

function parseDesktopApiRequest(value: unknown, allowedOrigin: string): DesktopApiRequest {
  if (!isRecord(value)) throw new Error("Invalid desktop API request");
  const url = Reflect.get(value, "url");
  const methodValue = Reflect.get(value, "method");
  const rawHeaders = Reflect.get(value, "headers");
  const body = Reflect.get(value, "body");
  if (typeof url !== "string" || url.length > 4_096 || typeof methodValue !== "string") {
    throw new Error("Invalid desktop API request");
  }
  const method = methodValue.toUpperCase();
  if (!ALLOWED_DESKTOP_API_METHODS.has(method)) throw new Error("Invalid desktop API method");
  if (!Array.isArray(rawHeaders) || rawHeaders.length > MAX_DESKTOP_API_HEADERS) {
    throw new Error("Invalid desktop API headers");
  }
  if (body !== null && !(body instanceof Uint8Array)) {
    throw new Error("Invalid desktop API body");
  }
  if (body && body.byteLength > MAX_DESKTOP_API_BODY_BYTES) {
    throw new Error("Desktop API request body is too large");
  }
  if ((method === "GET" || method === "HEAD") && body !== null) {
    throw new Error("Desktop API request method cannot include a body");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid desktop API URL");
  }
  if (
    parsed.origin !== allowedOrigin ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.pathname !== "/api" && !parsed.pathname.startsWith("/api/"))
  ) {
    throw new Error("Desktop API URL is outside the configured API boundary");
  }

  const headers = new Headers();
  let headerBytes = 0;
  for (const entry of rawHeaders) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error("Invalid desktop API header");
    const [name, headerValue] = entry;
    if (typeof name !== "string" || typeof headerValue !== "string") {
      throw new Error("Invalid desktop API header");
    }
    const lowerName = name.toLowerCase();
    if (
      BLOCKED_RENDERER_HEADERS.has(lowerName) ||
      lowerName.startsWith("proxy-") ||
      lowerName.startsWith("sec-") ||
      lowerName.startsWith("x-forwarded-")
    ) {
      throw new Error("Desktop renderer cannot set protected request headers");
    }
    headerBytes += new TextEncoder().encode(name).byteLength;
    headerBytes += new TextEncoder().encode(headerValue).byteLength;
    if (headerBytes > MAX_DESKTOP_API_HEADER_BYTES) {
      throw new Error("Desktop API headers are too large");
    }
    try {
      headers.append(name, headerValue);
    } catch {
      throw new Error("Invalid desktop API header");
    }
  }

  // Trusted main-process provenance. This is CSRF signaling, never identity;
  // session.defaultSession supplies and validates the HttpOnly session cookie.
  headers.set("Origin", allowedOrigin);
  headers.set("Sec-Fetch-Site", "same-origin");
  headers.set("X-Ghostinit-Native-Client", "desktop");
  return { body, headers: [...headers.entries()], method, url: parsed.toString() };
}

function safeResponseHeaders(headers: Headers): [string, string][] {
  const safe: [string, string][] = [];
  let bytes = 0;
  for (const [name, value] of headers.entries()) {
    if (name.toLowerCase() === "set-cookie" || name.toLowerCase() === "set-cookie2") continue;
    bytes += name.length + value.length;
    if (safe.length >= MAX_DESKTOP_API_HEADERS || bytes > MAX_DESKTOP_API_HEADER_BYTES) break;
    safe.push([name, value]);
  }
  return safe;
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

export async function handleDesktopApiRequest(value: unknown): Promise<DesktopApiResponse> {
  const allowedOrigin = configuredDesktopApiOrigin();
  const input = parseDesktopApiRequest(value, allowedOrigin);
  const response = await session.defaultSession.fetch(input.url, {
    method: input.method,
    headers: input.headers,
    ...(input.body === null ? {} : { body: ownedArrayBuffer(input.body) }),
    credentials: "include",
    redirect: "manual",
  });
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DESKTOP_API_BODY_BYTES) {
    throw new Error("Desktop API response body is too large");
  }
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_DESKTOP_API_BODY_BYTES) {
    throw new Error("Desktop API response body is too large");
  }
  return {
    body,
    headers: safeResponseHeaders(response.headers),
    status: response.status,
    statusText: response.statusText,
  };
}
`;
}

/** Renderer-side fetch adapter shared by Better Auth and oRPC. */
export function desktopRendererFetchContent(): string {
  return `export type DesktopApiRequest = {
  readonly body: Uint8Array | null;
  readonly headers: [string, string][];
  readonly method: string;
  readonly url: string;
};

export type DesktopApiResponse = {
  readonly body: Uint8Array;
  readonly headers: [string, string][];
  readonly status: number;
  readonly statusText: string;
};

// Match the server oRPC admission bound so the full storage payload can cross IPC.
const MAX_DESKTOP_API_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};

function abortError(): DOMException {
  return new DOMException("The desktop API request was cancelled", "AbortError");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

async function withAbort<T>(pending: Promise<T>, signal: AbortSignal | null): Promise<T> {
  if (!signal) return await pending;
  if (signal.aborted) throw abortError();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener("abort", abort, { once: true });
    void pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export async function desktopBridgeFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const requestedUrl = new URL(request.url);
  const authoritativeOrigin = new URL(window.desktopBridge.apiUrl);
  const authoritativeUrl = new URL(\`\${requestedUrl.pathname}\${requestedUrl.search}\`, authoritativeOrigin);
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? null
    : new Uint8Array(await request.arrayBuffer());
  if (body && body.byteLength > MAX_DESKTOP_API_BODY_BYTES) {
    throw new Error("Desktop API request body is too large");
  }
  const result = await withAbort(
    window.desktopBridge.apiFetch({
      body,
      headers: [...request.headers.entries()],
      method,
      url: authoritativeUrl.toString(),
    }),
    request.signal,
  );
  return new Response(ownedArrayBuffer(result.body), {
    headers: result.headers,
    status: result.status,
    statusText: result.statusText,
  });
}
`;
}
