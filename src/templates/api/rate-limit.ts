/** Shared generated API mutation rate limiter. */
export function apiRateLimitContent(): string {
  return `import { ORPCError } from "@orpc/server";

const LOCAL_BUCKET_LIMIT = 10_000;
const MAX_KEY_LENGTH = 512;
const MAX_POLICY_LIMIT = 1_000_000;
const MAX_WINDOW_MS = 86_400_000;
const MAX_REDIS_URL_LENGTH = 2_048;
const MAX_REDIS_TOKEN_LENGTH = 4_096;
const REDIS_DEADLINE_MS = 2_500;
const localHits = new Map<string, { count: number; resetAt: number }>();
const redisScript = [
  "local window = tonumber(ARGV[1])",
  "if not window or window < 1 then return redis.error_reply('invalid window') end",
  "local count = redis.call('INCR', KEYS[1])",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if count == 1 or ttl < 0 then",
  "  redis.call('PEXPIRE', KEYS[1], window)",
  "  ttl = window",
  "end",
  "return { count, ttl }",
].join("\\n");

function unavailable(message: string): never {
  throw new ORPCError("SERVICE_UNAVAILABLE", { message });
}

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

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || host === "::1" || isIpv4Loopback(host);
}

function permitsLocalFallback(): boolean {
  const nodeEnvironment = Reflect.get(process.env, "NODE_ENV");
  const vercel = Reflect.get(process.env, "VERCEL");
  const hostedVercel = typeof vercel === "string" && vercel.length > 0 && vercel !== "0";
  return !hostedVercel && (nodeEnvironment === "development" || nodeEnvironment === "test");
}

function sharedRedis(): { endpoint: URL; token: string } | null {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  const url = rawUrl.trim();
  const token = rawToken.trim();
  const urlConfigured = Boolean(url && !url.startsWith("REPLACE_WITH"));
  const tokenConfigured = Boolean(token && !token.startsWith("REPLACE_WITH"));
  if (!urlConfigured && !tokenConfigured) {
    if (!permitsLocalFallback()) unavailable("Shared API rate limiting is not configured");
    return null;
  }
  if (!urlConfigured || !tokenConfigured) {
    unavailable("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together");
  }
  if (rawUrl !== url || rawToken !== token) {
    unavailable("Upstash Redis credentials must not contain surrounding whitespace");
  }
  if (url.length > MAX_REDIS_URL_LENGTH) unavailable("UPSTASH_REDIS_REST_URL is too long");
  if (token.length > MAX_REDIS_TOKEN_LENGTH || !/^[\\x21-\\x7e]+$/.test(token)) {
    unavailable("UPSTASH_REDIS_REST_TOKEN contains invalid characters");
  }
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    unavailable("UPSTASH_REDIS_REST_URL is invalid");
  }
  if (base.username || base.password) {
    unavailable("UPSTASH_REDIS_REST_URL must not contain credentials");
  }
  if (base.search || base.hash || (base.pathname !== "" && base.pathname !== "/")) {
    unavailable("UPSTASH_REDIS_REST_URL must be an origin without a path, query, or fragment");
  }
  const loopbackDevelopment =
    permitsLocalFallback() && base.protocol === "http:" && isLoopback(base.hostname);
  if (base.protocol !== "https:" && !loopbackDevelopment) {
    unavailable("UPSTASH_REDIS_REST_URL must use HTTPS; loopback HTTP is development-only");
  }
  return { endpoint: new URL("/pipeline", base), token };
}

function validateInput(key: string, limit: number, windowMs: number): void {
  if (
    !key ||
    key.length > MAX_KEY_LENGTH ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_POLICY_LIMIT ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1 ||
    windowMs > MAX_WINDOW_MS
  ) {
    unavailable("API rate-limit policy is invalid");
  }
}

function checkLocal(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const current = localHits.get(key);
  if (!current || now >= current.resetAt) {
    if (!current && localHits.size >= LOCAL_BUCKET_LIMIT) {
      for (const [candidate, bucket] of localHits) {
        if (now >= bucket.resetAt) localHits.delete(candidate);
      }
      if (localHits.size >= LOCAL_BUCKET_LIMIT) unavailable("Local API rate-limit capacity is exhausted");
    }
    localHits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests. Try again later." });
  }
}

async function checkShared(
  redis: { endpoint: URL; token: string },
  key: string,
  limit: number,
  windowMs: number,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(redis.endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + redis.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      // The pipeline contains one EVAL command. Redis executes that script atomically;
      // no independent pipeline command can interleave between INCR and PEXPIRE.
      body: JSON.stringify([["EVAL", redisScript, 1, "ghostinit:api-rate:" + key, String(windowMs)]]),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REDIS_DEADLINE_MS),
    });
  } catch {
    unavailable("Shared API rate limiter is unavailable");
  }
  if (!response.ok) unavailable("Shared API rate limiter rejected the request");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    unavailable("Shared API rate limiter returned invalid JSON");
  }
  if (!Array.isArray(payload) || payload.length !== 1 || !isRecord(payload[0])) {
    unavailable("Shared API rate limiter returned an invalid pipeline envelope");
  }
  const first = payload[0];
  if (typeof Reflect.get(first, "error") === "string") {
    unavailable("Shared API rate limiter rejected the atomic command");
  }
  const result = Reflect.get(first, "result");
  if (!Array.isArray(result) || result.length !== 2) {
    unavailable("Shared API rate limiter returned an invalid atomic result");
  }
  const countValue = result[0];
  const ttlValue = result[1];
  const count = typeof countValue === "number" ? countValue : Number.NaN;
  const ttl = typeof ttlValue === "number" ? ttlValue : Number.NaN;
  if (!Number.isSafeInteger(count) || count < 1) {
    unavailable("Shared API rate limiter returned an invalid counter");
  }
  if (!Number.isSafeInteger(ttl) || ttl < 0 || ttl > windowMs) {
    unavailable("Shared API rate limiter returned an invalid expiry");
  }
  if (count > limit) {
    throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests. Try again later." });
  }
}

export async function rateLimit(key: string, limit = 60, windowMs = 60_000): Promise<void> {
  validateInput(key, limit, windowMs);
  const redis = sharedRedis();
  if (redis) {
    await checkShared(redis, key, limit, windowMs);
    return;
  }
  checkLocal(key, limit, windowMs);
}

export async function rateLimitGenerous(key: string): Promise<void> {
  await rateLimit(key, 100, 60_000);
}

export async function rateLimitStandard(key: string): Promise<void> {
  await rateLimit(key, 60, 60_000);
}

export async function rateLimitStrict(key: string): Promise<void> {
  await rateLimit(key, 20, 60_000);
}
`;
}

export function applicationRateLimitContent(): string {
  return apiRateLimitContent()
    .replace(
      'import { ORPCError } from "@orpc/server";',
      'import { RequestApplicationError } from "./errors.js";',
    )
    .replace(
      'throw new ORPCError("SERVICE_UNAVAILABLE", { message });',
      'throw new RequestApplicationError("APPLICATION_RATE_LIMIT_UNAVAILABLE", message);',
    )
    .replaceAll(
      'throw new ORPCError("TOO_MANY_REQUESTS", { message: "Too many requests. Try again later." });',
      'throw new RequestApplicationError("APPLICATION_RATE_LIMITED", "Too many requests. Try again later.");',
    );
}
