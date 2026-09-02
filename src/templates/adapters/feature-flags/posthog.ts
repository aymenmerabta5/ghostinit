// @allow-long 340: trusted-subject construction and bounded provider parsing form one security boundary
import type { ProjectMode } from "../../../lib/addons.js";

export function postHogFeatureFlagAdapterContent(mode: ProjectMode): string {
  void mode;
  return `// @allow-long 320: trusted server subject plus bounded fail-closed PostHog decide adapter
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { defineRemoteFeatureFlagAdapter } from "./adapter-contract.js";
import { FeatureFlagError } from "./errors.js";
import {
  type FeatureFlagProviderEvaluation,
  type FeatureFlagSubject,
} from "./contracts.js";

const trustedSubjects = new WeakSet<object>();
const MAX_RESPONSE_BYTES = 1_048_576;
const ANONYMOUS_COOKIE_VERSION = "v1";
const ANONYMOUS_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const ANONYMOUS_COOKIE_FUTURE_SKEW_SECONDS = 5 * 60;

function trustedSubject(kind: FeatureFlagSubject["kind"], key: string, attributes: FeatureFlagSubject["attributes"]): FeatureFlagSubject {
  const stableKey = key.trim();
  if (!stableKey || stableKey.length > 512) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "A stable server-derived subject is required");
  }
  const subject: FeatureFlagSubject = Object.freeze({
    kind,
    key: ["ghostinit", kind, encodeURIComponent(stableKey)].join(":"),
    attributes: Object.freeze({ ...attributes, subjectKind: kind }),
  });
  trustedSubjects.add(subject);
  return subject;
}

/** Construct only from the authenticated server session, never request JSON. */
export function createAuthenticatedFeatureFlagSubject(
  authenticatedUserId: string,
  attributes: FeatureFlagSubject["attributes"] = {},
): FeatureFlagSubject {
  return trustedSubject("user", authenticatedUserId, attributes);
}

/** Verify the anonymous cookie MAC in this server-only boundary. */
export function createAnonymousFeatureFlagSubjectFromSignedCookie(input: {
  signedCookie: string;
  signingSecret: string;
  attributes?: FeatureFlagSubject["attributes"];
  now?: Date;
}): FeatureFlagSubject {
  const [version, anonymousId = "", issuedAtText = "", supplied = "", ...extra] =
    input.signedCookie.split(".");
  const issuedAt = Number(issuedAtText);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    version !== ANONYMOUS_COOKIE_VERSION ||
    !/^[A-Za-z0-9_-]{43}$/.test(anonymousId ?? "") ||
    !Number.isSafeInteger(issuedAt) ||
    issuedAt <= 0 ||
    issuedAt > nowSeconds + ANONYMOUS_COOKIE_FUTURE_SKEW_SECONDS ||
    nowSeconds - issuedAt > ANONYMOUS_COOKIE_MAX_AGE_SECONDS ||
    !supplied ||
    extra.length > 0 ||
    input.signingSecret.length < 32
  ) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "Anonymous subject signature is invalid");
  }
  const unsigned = [version, anonymousId, issuedAtText].join(".");
  const expected = createHmac("sha256", input.signingSecret).update(unsigned, "utf8").digest("base64url");
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.byteLength !== suppliedBytes.byteLength || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "Anonymous subject signature is invalid");
  }
  return trustedSubject("anonymous", anonymousId, input.attributes ?? {});
}

/** Mint a versioned anonymous identity in this server-only boundary. */
export function createAnonymousFeatureFlagSubjectAndCookie(input: {
  signingSecret: string;
  now?: Date;
}): { subject: FeatureFlagSubject; signedCookie: string; maxAgeSeconds: number } {
  if (input.signingSecret.length < 32) {
    throw new FeatureFlagError("FEATURE_FLAG_SUBJECT_REQUIRED", "Anonymous subject signing is unavailable");
  }
  const now = input.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const anonymousId = randomBytes(32).toString("base64url");
  const unsigned = [ANONYMOUS_COOKIE_VERSION, anonymousId, String(issuedAt)].join(".");
  const signature = createHmac("sha256", input.signingSecret)
    .update(unsigned, "utf8")
    .digest("base64url");
  return {
    subject: trustedSubject("anonymous", anonymousId, {}),
    signedCookie: unsigned + "." + signature,
    maxAgeSeconds: ANONYMOUS_COOKIE_MAX_AGE_SECONDS,
  };
}

interface PostHogDecideResponse {
  errorsWhileComputingFlags?: boolean;
  featureFlags?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}

async function readBoundedResponse(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new FeatureFlagError(
          "FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION",
          "PostHog response exceeded the size limit",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new FeatureFlagError(
      "FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION",
      "PostHog response is not valid UTF-8",
      { cause: error },
    );
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function decodeFlag(key: string, raw: unknown): FeatureFlagProviderEvaluation | null {
  const modern = record(raw);
  const enabled = modern ? modern.enabled : raw;
  const variant = modern && typeof modern.variant === "string" ? modern.variant : null;
  const value = variant ?? enabled;
  if (typeof value !== "boolean" && typeof value !== "string" && typeof value !== "number") return null;
  const metadata = modern ? record(modern.metadata) : null;
  const rawVersion = metadata?.version;
  return {
    key,
    value,
    variant: typeof value === "string" ? value : variant,
    reason: value === false ? "disabled" : variant ? "targeting-match" : "rollout",
    version: typeof rawVersion === "string" || typeof rawVersion === "number" ? String(rawVersion) : null,
  };
}

function postHogHost(value: string): URL {
  let host: URL;
  try {
    host = new URL(value);
  } catch (error) {
    throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "POSTHOG_HOST is invalid", { cause: error });
  }
  const localHttp = host.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(host.hostname);
  if (host.protocol !== "https:" && !localHttp) {
    throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "POSTHOG_HOST must use HTTPS");
  }
  return host;
}

export interface PostHogFeatureFlagAdapterOptions {
  apiKey: string;
  host: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

export function createPostHogFeatureFlagAdapter(options: PostHogFeatureFlagAdapterOptions) {
  if (!options.apiKey || options.apiKey.includes("REPLACE_WITH")) {
    throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "PostHog feature flags are not configured");
  }
  const timeoutMs = options.timeoutMs ?? 2_500;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "PostHog timeout is outside safe bounds");
  }
  const endpoint = new URL("/decide/?v=3", postHogHost(options.host));
  const request = options.fetchImplementation ?? fetch;

  return defineRemoteFeatureFlagAdapter({
    kind: "posthog",
    async evaluateMany({ subject, keys }) {
      if (!trustedSubjects.has(subject)) {
        throw new FeatureFlagError(
          "FEATURE_FLAG_SUBJECT_REQUIRED",
          "Feature flag subjects must be constructed from trusted server identity",
        );
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      let body: string;
      try {
        response = await request(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: options.apiKey,
            distinct_id: subject.key,
            person_properties: subject.attributes,
            groups: {},
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "PostHog feature flags are unavailable");
        }
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
          throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION", "PostHog response exceeded the size limit");
        }
        body = await readBoundedResponse(response);
      } catch (error) {
        if (error instanceof FeatureFlagError) throw error;
        throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "PostHog feature flags are unavailable", { cause: error });
      } finally {
        clearTimeout(timeout);
      }
      let parsed: PostHogDecideResponse;
      try {
        const value: unknown = JSON.parse(body);
        const valueRecord = record(value);
        if (!valueRecord) throw new Error("response is not an object");
        parsed = valueRecord;
      } catch (error) {
        throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION", "PostHog returned invalid JSON", { cause: error });
      }
      if (parsed.errorsWhileComputingFlags) {
        throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_UNAVAILABLE", "PostHog could not compute feature flags");
      }
      const values = record(parsed.flags) ?? record(parsed.featureFlags) ?? {};
      const evaluations: FeatureFlagProviderEvaluation[] = [];
      for (const key of keys) {
        if (!Object.hasOwn(values, key)) continue;
        const evaluation = decodeFlag(key, values[key]);
        if (!evaluation) {
          throw new FeatureFlagError("FEATURE_FLAG_PROVIDER_CONTRACT_VIOLATION", "PostHog returned an invalid flag value");
        }
        evaluations.push(evaluation);
      }
      return evaluations;
    },
  });
}
`;
}
