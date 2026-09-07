// @allow-long 700: one fail-closed harness keeps every external target and shared safety invariant auditable in one place
import {
  configuredSecretValues,
  type FetchLike,
  parseHttpsEndpoint,
  type ReadinessEnvironment,
  requestJson,
  requestStatus,
  requireEnvironmentValue,
  requireExternalStagingHost,
  requirePinnedEndpointHostname,
  requireRecord,
  requireServiceHost,
  sanitizeExternalFailure,
} from "./external-readiness-http.js";

export const EXTERNAL_READINESS_TARGETS = [
  "upstash",
  "convex",
  "stripe",
  "chargily",
  "paddle",
  "polar",
  "staging",
] as const;

export type ExternalReadinessTarget = (typeof EXTERNAL_READINESS_TARGETS)[number];

export interface ExternalReadinessOptions {
  environment: ReadinessEnvironment;
  fetchImpl?: FetchLike;
  nonce?: () => string;
  now?: () => number;
  timeoutMs?: number;
}

export interface ExternalReadinessResult {
  target: ExternalReadinessTarget;
  durationMs: number;
}

const JSON_HEADERS = { Accept: "application/json" } as const;
const CONFIG_SCHEMA_VERSION = 1;
const MAX_ATOMIC_CONFIG_BYTES = 8 * 1024;

type AtomicTarget = "upstash" | "convex" | "staging";

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly the documented fields`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseAtomicConfig(
  environment: ReadinessEnvironment,
  name: string,
  fields: readonly string[],
): Record<string, unknown> {
  const raw = requireEnvironmentValue(environment, name, { secret: true });
  if (new TextEncoder().encode(raw).byteLength > MAX_ATOMIC_CONFIG_BYTES) {
    throw new Error(`${name} exceeds ${MAX_ATOMIC_CONFIG_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${name} must be valid single-line JSON`);
  }
  const config = requireRecord(parsed, name);
  requireExactKeys(config, ["schemaVersion", ...fields], name);
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    throw new Error(`${name}.schemaVersion must be ${CONFIG_SCHEMA_VERSION}`);
  }
  return config;
}

function configString(
  config: Record<string, unknown>,
  configName: string,
  field: string,
  options: { secret?: boolean } = {},
): string {
  const value = config[field];
  if (typeof value !== "string") throw new Error(`${configName}.${field} must be a string`);
  return requireEnvironmentValue(
    { [`${configName}.${field}`]: value },
    `${configName}.${field}`,
    options,
  );
}

function requireDedicatedCanary(value: string, target: AtomicTarget): string {
  const prefix = `ghostinit-external-readiness:v1:${target}:`;
  const suffix = value.slice(prefix.length);
  if (!value.startsWith(prefix) || !/^[A-Za-z0-9._-]{8,80}$/.test(suffix)) {
    throw new Error(`${target} canary must identify a dedicated external-readiness resource`);
  }
  return value;
}

function materializeAtomicTargetConfig(
  target: ExternalReadinessTarget,
  environment: ReadinessEnvironment,
): ReadinessEnvironment {
  if (target === "upstash") {
    const name = "GHOSTINIT_SMOKE_UPSTASH_CONFIG";
    const config = parseAtomicConfig(environment, name, [
      "canary",
      "endpoint",
      "hostnameSha256",
      "token",
    ]);
    return {
      ...environment,
      GHOSTINIT_SMOKE_UPSTASH_CANARY: requireDedicatedCanary(
        configString(config, name, "canary"),
        target,
      ),
      GHOSTINIT_SMOKE_UPSTASH_HOST_SHA256: configString(config, name, "hostnameSha256"),
      UPSTASH_REDIS_REST_TOKEN: configString(config, name, "token", { secret: true }),
      UPSTASH_REDIS_REST_URL: configString(config, name, "endpoint"),
    };
  }
  if (target === "convex") {
    const name = "GHOSTINIT_SMOKE_CONVEX_CONFIG";
    const config = parseAtomicConfig(environment, name, [
      "accessToken",
      "canary",
      "endpoint",
      "hostnameSha256",
      "query",
    ]);
    return {
      ...environment,
      CONVEX_URL: configString(config, name, "endpoint"),
      GHOSTINIT_SMOKE_CONVEX_ACCESS_TOKEN: configString(config, name, "accessToken", {
        secret: true,
      }),
      GHOSTINIT_SMOKE_CONVEX_CANARY: requireDedicatedCanary(
        configString(config, name, "canary"),
        target,
      ),
      GHOSTINIT_SMOKE_CONVEX_HOST_SHA256: configString(config, name, "hostnameSha256"),
      GHOSTINIT_SMOKE_CONVEX_QUERY: configString(config, name, "query"),
    };
  }
  if (target === "staging") {
    const name = "GHOSTINIT_STAGING_CONFIG";
    const config = parseAtomicConfig(environment, name, [
      "bearerToken",
      "canary",
      "endpoint",
      "hostnameSha256",
    ]);
    return {
      ...environment,
      GHOSTINIT_STAGING_BEARER_TOKEN: configString(config, name, "bearerToken", {
        secret: true,
      }),
      GHOSTINIT_STAGING_CANARY: requireDedicatedCanary(
        configString(config, name, "canary"),
        target,
      ),
      GHOSTINIT_STAGING_HEALTH_URL: configString(config, name, "endpoint"),
      GHOSTINIT_STAGING_HOST_SHA256: configString(config, name, "hostnameSha256"),
    };
  }
  return environment;
}

export function isExternalReadinessTarget(value: string): value is ExternalReadinessTarget {
  return (EXTERNAL_READINESS_TARGETS as readonly string[]).includes(value);
}

function configuredTimeout(environment: ReadinessEnvironment): number {
  const raw = environment.GHOSTINIT_SMOKE_TIMEOUT_MS;
  if (!raw) return 10_000;
  if (!/^\d+$/.test(raw)) throw new Error("GHOSTINIT_SMOKE_TIMEOUT_MS must be an integer");
  const timeoutMs = Number(raw);
  if (timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("GHOSTINIT_SMOKE_TIMEOUT_MS must be between 1000 and 30000");
  }
  return timeoutMs;
}

function bearerHeaders(credential: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    ...JSON_HEADERS,
    ...extra,
    Authorization: `Bearer ${credential}`,
  };
}

async function requireAnonymousDenial(
  label: string,
  url: URL | string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<void> {
  const status = await requestStatus(label, url, init, timeoutMs, fetchImpl);
  if (status !== 401 && status !== 403) {
    throw new Error(`${label} must reject the anonymous negative control`);
  }
}

async function probeUpstash(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
  nonce: () => string,
): Promise<void> {
  const url = parseHttpsEndpoint(
    requireEnvironmentValue(environment, "UPSTASH_REDIS_REST_URL"),
    "UPSTASH_REDIS_REST_URL",
  );
  requireServiceHost(url, "upstash.io", "UPSTASH_REDIS_REST_URL");
  if (url.pathname !== "/") throw new Error("UPSTASH_REDIS_REST_URL must be an origin URL");
  requirePinnedEndpointHostname(
    url,
    requireEnvironmentValue(environment, "GHOSTINIT_SMOKE_UPSTASH_HOST_SHA256"),
    "GHOSTINIT_SMOKE_UPSTASH_HOST_SHA256",
  );
  const canary = requireEnvironmentValue(environment, "GHOSTINIT_SMOKE_UPSTASH_CANARY");
  const canaryBody = JSON.stringify(["GET", "ghostinit:external-readiness:canary"]);
  await requireAnonymousDenial(
    "Anonymous Upstash canary",
    url,
    {
      method: "POST",
      headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
      body: canaryBody,
    },
    timeoutMs,
    fetchImpl,
  );
  const token = requireEnvironmentValue(environment, "UPSTASH_REDIS_REST_TOKEN", {
    secret: true,
  });
  const canaryResponse = requireRecord(
    await requestJson(
      "Upstash environment canary",
      url,
      {
        method: "POST",
        headers: bearerHeaders(token, { "Content-Type": "application/json" }),
        body: canaryBody,
      },
      timeoutMs,
      fetchImpl,
    ),
    "Upstash environment canary",
  );
  requireExactKeys(canaryResponse, ["result"], "Upstash environment canary");
  if (canaryResponse.result !== canary) {
    throw new Error("Upstash environment canary did not match; refusing to write");
  }
  const runId = nonce();
  const key = `ghostinit:external-readiness:${runId}`;
  const expected = `probe-${runId}`;
  let probeFailure: unknown;
  try {
    const response = await requestJson(
      "Upstash write/read pipeline",
      new URL("/pipeline", url),
      {
        method: "POST",
        headers: bearerHeaders(token, { "Content-Type": "application/json" }),
        body: JSON.stringify([
          ["SET", key, expected, "EX", 60],
          ["GET", key],
        ]),
      },
      timeoutMs,
      fetchImpl,
    );
    if (
      !Array.isArray(response) ||
      response.length !== 2 ||
      requireRecord(response[0], "Upstash SET").result !== "OK" ||
      requireRecord(response[1], "Upstash GET").result !== expected
    ) {
      throw new Error("Upstash pipeline returned an unexpected response");
    }
  } catch (error) {
    probeFailure = error;
  }

  try {
    const cleanup = requireRecord(
      await requestJson(
        "Upstash cleanup",
        url,
        {
          method: "POST",
          headers: bearerHeaders(token, { "Content-Type": "application/json" }),
          body: JSON.stringify(["DEL", key]),
        },
        timeoutMs,
        fetchImpl,
      ),
      "Upstash cleanup",
    );
    requireExactKeys(cleanup, ["result"], "Upstash cleanup");
    if (cleanup.result !== 1) {
      throw new Error("Upstash cleanup returned an unexpected response");
    }
  } catch {
    if (probeFailure) {
      throw new Error(
        "Upstash probe failed and cleanup could not be confirmed; the probe key has a 60-second TTL",
      );
    }
    throw new Error("Upstash cleanup could not be confirmed; the probe key has a 60-second TTL");
  }
  if (probeFailure) throw probeFailure;
}

async function probeConvex(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<void> {
  const url = parseHttpsEndpoint(requireEnvironmentValue(environment, "CONVEX_URL"), "CONVEX_URL");
  requireServiceHost(url, "convex.cloud", "CONVEX_URL");
  if (url.pathname !== "/") throw new Error("CONVEX_URL must be a deployment origin URL");
  requirePinnedEndpointHostname(
    url,
    requireEnvironmentValue(environment, "GHOSTINIT_SMOKE_CONVEX_HOST_SHA256"),
    "GHOSTINIT_SMOKE_CONVEX_HOST_SHA256",
  );
  const query = requireEnvironmentValue(environment, "GHOSTINIT_SMOKE_CONVEX_QUERY");
  if (!/^[A-Za-z0-9_./-]{1,160}:[A-Za-z0-9_./-]{1,160}$/.test(query)) {
    throw new Error("GHOSTINIT_SMOKE_CONVEX_QUERY must be a public query function path");
  }
  const canary = requireEnvironmentValue(environment, "GHOSTINIT_SMOKE_CONVEX_CANARY");
  const body = JSON.stringify({ path: query, args: {}, format: "json" });
  const anonymousResponse = requireRecord(
    await requestJson(
      "Anonymous Convex query",
      new URL("/api/query", url),
      {
        method: "POST",
        headers: { ...JSON_HEADERS, "Content-Type": "application/json" },
        body,
      },
      timeoutMs,
      fetchImpl,
    ),
    "Anonymous Convex query",
  );
  const anonymousValue = requireRecord(anonymousResponse.value, "Anonymous Convex query value");
  requireExactKeys(anonymousValue, ["authenticated", "canary"], "Anonymous Convex query value");
  if (
    anonymousResponse.status !== "success" ||
    anonymousValue.authenticated !== false ||
    anonymousValue.canary !== canary
  ) {
    throw new Error("Convex query did not prove the anonymous negative control");
  }
  const token = requireEnvironmentValue(environment, "GHOSTINIT_SMOKE_CONVEX_ACCESS_TOKEN", {
    secret: true,
  });
  const response = requireRecord(
    await requestJson(
      "Convex query",
      new URL("/api/query", url),
      {
        method: "POST",
        headers: bearerHeaders(token, { "Content-Type": "application/json" }),
        body,
      },
      timeoutMs,
      fetchImpl,
    ),
    "Convex query",
  );
  const value = requireRecord(response.value, "Convex query value");
  requireExactKeys(value, ["authenticated", "canary"], "Convex query value");
  if (response.status !== "success" || value.authenticated !== true || value.canary !== canary) {
    throw new Error("Convex query did not prove the authenticated test deployment canary");
  }
}

async function probeStripe(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<void> {
  const key = requireEnvironmentValue(environment, "STRIPE_SECRET_KEY", { secret: true });
  if (!/^(?:sk|rk)_test_/.test(key)) {
    throw new Error("Stripe readiness accepts only an sk_test_ or rk_test_ credential");
  }
  const url = "https://api.stripe.com/v1/balance";
  await requireAnonymousDenial(
    "Anonymous Stripe test balance",
    url,
    { method: "GET", headers: JSON_HEADERS },
    timeoutMs,
    fetchImpl,
  );
  const response = requireRecord(
    await requestJson(
      "Stripe test balance",
      url,
      { method: "GET", headers: bearerHeaders(key) },
      timeoutMs,
      fetchImpl,
    ),
    "Stripe test balance",
  );
  if (
    response.object !== "balance" ||
    response.livemode !== false ||
    !Array.isArray(response.available) ||
    !Array.isArray(response.pending)
  ) {
    throw new Error("Stripe returned an unexpected test-balance response");
  }
}

async function probeChargily(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<void> {
  if (requireEnvironmentValue(environment, "CHARGILY_MODE") !== "test") {
    throw new Error("Chargily readiness requires CHARGILY_MODE=test");
  }
  const key = requireEnvironmentValue(environment, "CHARGILY_API_KEY", { secret: true });
  const url = "https://pay.chargily.net/test/api/v2/balance";
  await requireAnonymousDenial(
    "Anonymous Chargily test balance",
    url,
    { method: "GET", headers: JSON_HEADERS },
    timeoutMs,
    fetchImpl,
  );
  const response = requireRecord(
    await requestJson(
      "Chargily test balance",
      url,
      { method: "GET", headers: bearerHeaders(key) },
      timeoutMs,
      fetchImpl,
    ),
    "Chargily test balance",
  );
  if (
    response.entity !== "balance" ||
    response.livemode !== false ||
    !Array.isArray(response.wallets) ||
    response.wallets.length === 0 ||
    !response.wallets.every(
      (wallet) =>
        isRecord(wallet) &&
        typeof wallet.currency === "string" &&
        wallet.currency.length > 0 &&
        isFiniteNumber(wallet.balance) &&
        isFiniteNumber(wallet.ready_for_payout) &&
        isFiniteNumber(wallet.on_hold),
    )
  ) {
    throw new Error("Chargily returned an unexpected test-balance response");
  }
}

async function probePaddle(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<void> {
  if (requireEnvironmentValue(environment, "PADDLE_ENVIRONMENT") !== "sandbox") {
    throw new Error("Paddle readiness requires PADDLE_ENVIRONMENT=sandbox");
  }
  const key = requireEnvironmentValue(environment, "PADDLE_API_KEY", { secret: true });
  if (!key.startsWith("pdl_sdbx_apikey_")) {
    throw new Error("Paddle readiness accepts only a modern sandbox credential");
  }
  const url = "https://sandbox-api.paddle.com/event-types";
  const headers = { ...JSON_HEADERS, "Paddle-Version": "1" };
  await requireAnonymousDenial(
    "Anonymous Paddle sandbox event types",
    url,
    { method: "GET", headers },
    timeoutMs,
    fetchImpl,
  );
  const response = requireRecord(
    await requestJson(
      "Paddle sandbox event types",
      url,
      {
        method: "GET",
        headers: bearerHeaders(key, { "Paddle-Version": "1" }),
      },
      timeoutMs,
      fetchImpl,
    ),
    "Paddle sandbox event types",
  );
  if (
    !Array.isArray(response.data) ||
    response.data.length === 0 ||
    !response.data.every(
      (eventType) =>
        isRecord(eventType) &&
        typeof eventType.name === "string" &&
        eventType.name.length > 0 &&
        typeof eventType.description === "string" &&
        typeof eventType.group === "string" &&
        Array.isArray(eventType.available_versions),
    )
  ) {
    throw new Error("Paddle returned an unexpected sandbox event-types response");
  }
}

async function probePolar(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<void> {
  if (requireEnvironmentValue(environment, "POLAR_ENVIRONMENT") !== "sandbox") {
    throw new Error("Polar readiness requires POLAR_ENVIRONMENT=sandbox");
  }
  const token = requireEnvironmentValue(environment, "POLAR_ACCESS_TOKEN", { secret: true });
  if (!token.startsWith("polar_oat_")) {
    throw new Error("Polar readiness requires a sandbox organization access token");
  }
  const url = "https://sandbox-api.polar.sh/v1/organizations?limit=1";
  await requireAnonymousDenial(
    "Anonymous Polar sandbox organizations",
    url,
    { method: "GET", headers: JSON_HEADERS },
    timeoutMs,
    fetchImpl,
  );
  const response = requireRecord(
    await requestJson(
      "Polar sandbox organizations",
      url,
      { method: "GET", headers: bearerHeaders(token) },
      timeoutMs,
      fetchImpl,
    ),
    "Polar sandbox organizations",
  );
  const pagination = requireRecord(response.pagination, "Polar organizations pagination");
  if (
    !Array.isArray(response.items) ||
    response.items.some((item) => !isRecord(item)) ||
    !Number.isInteger(pagination.total_count) ||
    !Number.isInteger(pagination.max_page)
  ) {
    throw new Error("Polar returned an unexpected sandbox organizations response");
  }
}

async function probeStaging(
  environment: ReadinessEnvironment,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<void> {
  const url = parseHttpsEndpoint(
    requireEnvironmentValue(environment, "GHOSTINIT_STAGING_HEALTH_URL"),
    "GHOSTINIT_STAGING_HEALTH_URL",
  );
  requireExternalStagingHost(url);
  requirePinnedEndpointHostname(
    url,
    requireEnvironmentValue(environment, "GHOSTINIT_STAGING_HOST_SHA256"),
    "GHOSTINIT_STAGING_HOST_SHA256",
  );
  const anonymousStatus = await requestStatus(
    "Anonymous staging health",
    url,
    { method: "GET", headers: JSON_HEADERS },
    timeoutMs,
    fetchImpl,
  );
  if (anonymousStatus !== 401 && anonymousStatus !== 403) {
    throw new Error("Staging health must reject the anonymous negative control");
  }
  const token = requireEnvironmentValue(environment, "GHOSTINIT_STAGING_BEARER_TOKEN", {
    secret: true,
  });
  const canary = requireEnvironmentValue(environment, "GHOSTINIT_STAGING_CANARY");
  const response = requireRecord(
    await requestJson(
      "Staging health",
      url,
      { method: "GET", headers: bearerHeaders(token) },
      timeoutMs,
      fetchImpl,
    ),
    "Staging health",
  );
  requireExactKeys(response, ["canary", "environment", "status"], "Staging health");
  if (
    response.status !== "ok" ||
    response.environment !== "staging" ||
    response.canary !== canary
  ) {
    throw new Error("Staging health did not prove the protected deployment canary");
  }
}

const PROBES: Record<
  ExternalReadinessTarget,
  (
    environment: ReadinessEnvironment,
    fetchImpl: FetchLike,
    timeoutMs: number,
    nonce: () => string,
  ) => Promise<void>
> = {
  upstash: probeUpstash,
  convex: probeConvex,
  stripe: probeStripe,
  chargily: probeChargily,
  paddle: probePaddle,
  polar: probePolar,
  staging: probeStaging,
};

export async function runExternalReadinessTarget(
  target: ExternalReadinessTarget | string,
  options: ExternalReadinessOptions,
): Promise<ExternalReadinessResult> {
  if (!isExternalReadinessTarget(target)) {
    throw new Error("Unsupported external-readiness target; refusing to run");
  }
  const sourceEnvironment = options.environment;
  if (sourceEnvironment.GHOSTINIT_EXTERNAL_READINESS !== "1") {
    throw new Error(
      "External readiness is disabled; set GHOSTINIT_EXTERNAL_READINESS=1 explicitly",
    );
  }
  const secretValues = configuredSecretValues(sourceEnvironment);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const nonce = options.nonce ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const environment = materializeAtomicTargetConfig(target, sourceEnvironment);
    secretValues.push(...configuredSecretValues(environment));
    const timeoutMs = options.timeoutMs ?? configuredTimeout(environment);
    await PROBES[target](environment, fetchImpl, timeoutMs, nonce);
  } catch (error) {
    throw new Error(`${target} readiness failed: ${sanitizeExternalFailure(error, secretValues)}`);
  }
  return { target, durationMs: Math.max(0, now() - startedAt) };
}
