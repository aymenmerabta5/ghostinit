import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { redactSecretValues } from "../src/lib/logger.js";

export type ReadinessEnvironment = Readonly<Record<string, string | undefined>>;
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const MAX_RESPONSE_BYTES = 64 * 1024;
const PLACEHOLDER_PREFIX = "REPLACE_WITH_";

export function requireEnvironmentValue(
  environment: ReadinessEnvironment,
  name: string,
  options: { secret?: boolean } = {},
): string {
  const value = environment[name];
  if (!value || value.startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error(`${name} is required for this external-readiness target`);
  }
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (value !== value.trim() || hasControlCharacter) {
    throw new Error(`${name} contains surrounding whitespace or control characters`);
  }
  if (options.secret && value.length < 8) {
    throw new Error(`${name} is too short to be a configured credential`);
  }
  return value;
}

export function configuredSecretValues(environment: ReadinessEnvironment): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(environment)) {
    const sensitiveName =
      /(?:secret|token|key|password|credential|authorization|bearer|config)/i.test(name) ||
      /(?:^|_)(?:url|endpoint|host)(?:_|$)/i.test(name);
    if (!sensitiveName || typeof value !== "string" || value.length === 0) continue;
    values.add(value);

    // Atomic target configs are secret JSON blobs. Also redact their scalar fields so a
    // transport error cannot reveal only the embedded token, endpoint, or canary.
    if (/config/i.test(name) && value.length <= MAX_RESPONSE_BYTES) {
      try {
        const pending: unknown[] = [JSON.parse(value) as unknown];
        let visited = 0;
        while (pending.length > 0 && visited < 64) {
          visited += 1;
          const item = pending.pop();
          if (typeof item === "string" && item.length >= 4) values.add(item);
          else if (Array.isArray(item)) pending.push(...item);
          else if (typeof item === "object" && item !== null) {
            pending.push(...Object.values(item as Record<string, unknown>));
          }
        }
      } catch {
        // Parsing and schema validation happen in the harness; the opaque blob is still redacted.
      }
    }
  }
  return [...values].sort((left, right) => right.length - left.length);
}

export function sanitizeExternalFailure(error: unknown, secretValues: readonly string[]): string {
  let message = error instanceof Error ? error.message : "External-readiness probe failed";
  for (const secret of secretValues) {
    if (!secret) continue;
    const variants = new Set([secret]);
    for (const encode of [encodeURI, encodeURIComponent]) {
      try {
        variants.add(encode(secret));
      } catch {
        // An invalid Unicode scalar must not make the failure sanitizer fail open.
      }
    }
    variants.add(new URLSearchParams({ value: secret }).toString().slice("value=".length));
    variants.add(JSON.stringify(secret).slice(1, -1));
    for (const variant of variants) {
      if (variant && variant !== "***") message = message.replaceAll(variant, "***");
    }
  }
  const withoutControls = Array.from(redactSecretValues(message), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159) ? " " : character;
  }).join("");
  return withoutControls.replace(/\s+/g, " ").trim().slice(0, 1_000);
}

export function parseHttpsEndpoint(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, a query, or a fragment`);
  }
  if (url.port) throw new Error(`${label} must use the default HTTPS port`);
  return url;
}

export function requireServiceHost(url: URL, domainSuffix: string, label: string): void {
  const hostname = url.hostname.toLowerCase();
  if (hostname !== domainSuffix && !hostname.endsWith(`.${domainSuffix}`)) {
    throw new Error(`${label} is not an approved ${domainSuffix} endpoint`);
  }
}

export function endpointHostnameSha256(url: URL): string {
  return createHash("sha256").update(url.hostname.toLowerCase(), "utf8").digest("hex");
}

export function requirePinnedEndpointHostname(
  url: URL,
  expectedSha256: string,
  environmentName: string,
): void {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error(`${environmentName} must be a lowercase SHA-256 digest`);
  }
  const actual = Buffer.from(endpointHostnameSha256(url), "hex");
  const expected = Buffer.from(expectedSha256, "hex");
  if (!timingSafeEqual(actual, expected)) {
    throw new Error(`${environmentName} does not match the selected endpoint hostname`);
  }
}

export function requireExternalStagingHost(url: URL): void {
  const hostname = url.hostname.toLowerCase();
  const bareHostname = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".test") ||
    isIP(bareHostname) !== 0
  ) {
    throw new Error("GHOSTINIT_STAGING_HEALTH_URL must use an external deployment hostname");
  }
  if (url.pathname.replace(/\/+$/, "") !== "/api/health") {
    throw new Error("GHOSTINIT_STAGING_HEALTH_URL must target /api/health");
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let ended = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        ended = true;
        break;
      }
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error(`External-readiness response exceeded ${MAX_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    if (!ended) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function requestJson(
  label: string,
  url: URL | string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${label} returned HTTP ${response.status}`);
    }
    const contentLength = response.headers.get("content-length");
    if (
      contentLength &&
      /^\d+$/.test(contentLength) &&
      Number(contentLength) > MAX_RESPONSE_BYTES
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`External-readiness response exceeded ${MAX_RESPONSE_BYTES} bytes`);
    }
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${label} returned a non-JSON response`);
    }
    const body = await readBoundedBody(response);
    if (!body.trim()) throw new Error(`${label} returned an empty response`);
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error(`${label} returned invalid JSON`);
    }
  } catch (error) {
    if (timedOut) throw new Error(`${label} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export async function requestStatus(
  label: string,
  url: URL | string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<number> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status;
  } catch (error) {
    if (timedOut) throw new Error(`${label} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} returned an unexpected response shape`);
  }
  return value as Record<string, unknown>;
}
