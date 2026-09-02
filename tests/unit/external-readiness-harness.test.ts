// @allow-long 600: one offline suite verifies every external target, redaction, deadlines, negative controls, and cleanup without provider calls
import { describe, expect, test } from "bun:test";
import {
  runExternalReadinessTarget,
  type ExternalReadinessTarget,
} from "../../scripts/external-readiness-harness.js";
import {
  endpointHostnameSha256,
  type FetchLike,
  type ReadinessEnvironment,
  sanitizeExternalFailure,
} from "../../scripts/external-readiness-http.js";

const enabled = { GHOSTINIT_EXTERNAL_READINESS: "1" } as const;
const canaries = {
  convex: "ghostinit-external-readiness:v1:convex:fixture-a",
  staging: "ghostinit-external-readiness:v1:staging:fixture-a",
  upstash: "ghostinit-external-readiness:v1:upstash:fixture-a",
} as const;
const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const denied = (status = 401): Response => new Response("", { status });
const pinnedHost = (url: string): string => endpointHostnameSha256(new URL(url));

function upstashEnvironment(
  url = "https://fixture.upstash.io",
  extra: ReadinessEnvironment = {},
): ReadinessEnvironment {
  return {
    ...enabled,
    ...extra,
    GHOSTINIT_SMOKE_UPSTASH_CONFIG: JSON.stringify({
      schemaVersion: 1,
      endpoint: url,
      hostnameSha256: pinnedHost(url),
      canary: canaries.upstash,
      token: "upstash-fixture-token",
    }),
  };
}

function convexEnvironment(
  url = "https://fixture.convex.cloud",
  extra: ReadinessEnvironment = {},
): ReadinessEnvironment {
  return {
    ...enabled,
    ...extra,
    GHOSTINIT_SMOKE_CONVEX_CONFIG: JSON.stringify({
      schemaVersion: 1,
      endpoint: url,
      hostnameSha256: pinnedHost(url),
      query: "health:check",
      canary: canaries.convex,
      accessToken: "convex-access-token",
    }),
  };
}

function stagingEnvironment(
  url = "https://staging.ghostinit.dev/api/health",
  extra: ReadinessEnvironment = {},
): ReadinessEnvironment {
  return {
    ...enabled,
    ...extra,
    GHOSTINIT_STAGING_CONFIG: JSON.stringify({
      schemaVersion: 1,
      endpoint: url,
      hostnameSha256: pinnedHost(url),
      canary: canaries.staging,
      bearerToken: "staging-fixture-token",
    }),
  };
}

type CapturedRequest = { url: string; init: RequestInit };

function captureFetch(
  response: (request: CapturedRequest, index: number) => Response | Promise<Response>,
): { calls: CapturedRequest[]; fetchImpl: FetchLike } {
  const calls: CapturedRequest[] = [];
  return {
    calls,
    fetchImpl: async (input, init = {}) => {
      const request = {
        url: input instanceof Request ? input.url : String(input),
        init,
      };
      calls.push(request);
      return response(request, calls.length - 1);
    },
  };
}

function authorization(request: CapturedRequest): string | null {
  return new Headers(request.init.headers).get("Authorization");
}

describe("external-readiness opt-in and transport safety", () => {
  test("never contacts a provider without the explicit live gate", async () => {
    let contacted = false;
    await expect(
      runExternalReadinessTarget("stripe", {
        environment: { STRIPE_SECRET_KEY: "sk_test_not_contacted" },
        fetchImpl: async () => {
          contacted = true;
          return json({});
        },
      }),
    ).rejects.toThrow("External readiness is disabled");
    expect(contacted).toBe(false);
  });

  test("fails closed on an unsupported runtime target", async () => {
    let contacted = false;
    await expect(
      runExternalReadinessTarget("unknown-target", {
        environment: enabled,
        fetchImpl: async () => {
          contacted = true;
          return json({});
        },
      }),
    ).rejects.toThrow("Unsupported external-readiness target");
    expect(contacted).toBe(false);
  });

  test("requires one atomic destination-and-credential config before fetch", async () => {
    let contacted = false;
    await expect(
      runExternalReadinessTarget("convex", {
        environment: enabled,
        fetchImpl: async () => {
          contacted = true;
          return json({});
        },
      }),
    ).rejects.toThrow("GHOSTINIT_SMOKE_CONVEX_CONFIG is required");
    expect(contacted).toBe(false);
  });

  test("rejects exfiltration endpoints, mismatched pins, and production billing modes", async () => {
    let contacted = false;
    const fetchImpl: FetchLike = async () => {
      contacted = true;
      return json({});
    };
    await expect(
      runExternalReadinessTarget("upstash", {
        environment: upstashEnvironment("https://attacker.example"),
        fetchImpl,
      }),
    ).rejects.toThrow("not an approved upstash.io endpoint");

    const upstashConfig = JSON.parse(
      String(upstashEnvironment().GHOSTINIT_SMOKE_UPSTASH_CONFIG),
    ) as Record<string, unknown>;
    upstashConfig.hostnameSha256 = pinnedHost("https://different.upstash.io");
    await expect(
      runExternalReadinessTarget("upstash", {
        environment: {
          ...enabled,
          GHOSTINIT_SMOKE_UPSTASH_CONFIG: JSON.stringify(upstashConfig),
        },
        fetchImpl,
      }),
    ).rejects.toThrow("does not match the selected endpoint hostname");

    await expect(
      runExternalReadinessTarget("convex", {
        environment: convexEnvironment("https://attacker.example"),
        fetchImpl,
      }),
    ).rejects.toThrow("not an approved convex.cloud endpoint");

    await expect(
      runExternalReadinessTarget("stripe", {
        environment: { ...enabled, STRIPE_SECRET_KEY: "sk_live_forbidden_value" },
        fetchImpl,
      }),
    ).rejects.toThrow("accepts only an sk_test_ or rk_test_ credential");
    await expect(
      runExternalReadinessTarget("chargily", {
        environment: {
          ...enabled,
          CHARGILY_API_KEY: "chargily-test-credential",
          CHARGILY_MODE: "live",
        },
        fetchImpl,
      }),
    ).rejects.toThrow("requires CHARGILY_MODE=test");
    await expect(
      runExternalReadinessTarget("paddle", {
        environment: {
          ...enabled,
          PADDLE_API_KEY: "pdl_live_apikey_forbidden_value",
          PADDLE_ENVIRONMENT: "sandbox",
        },
        fetchImpl,
      }),
    ).rejects.toThrow("accepts only a modern sandbox credential");
    expect(contacted).toBe(false);
  });

  test("legacy mutable URL fields cannot redirect an atomic staging config", async () => {
    const expectedUrl = "https://staging.ghostinit.dev/api/health";
    const { calls, fetchImpl } = captureFetch((_request, index) =>
      index === 0
        ? denied()
        : json({ status: "ok", environment: "staging", canary: canaries.staging }),
    );
    await runExternalReadinessTarget("staging", {
      environment: stagingEnvironment(expectedUrl, {
        GHOSTINIT_STAGING_HEALTH_URL: "https://attacker.example/api/health",
        GHOSTINIT_STAGING_HOST_SHA256: pinnedHost("https://attacker.example/api/health"),
        GHOSTINIT_STAGING_BEARER_TOKEN: "legacy-attacker-token",
      }),
      fetchImpl,
    });
    expect(calls.map(({ url }) => url)).toEqual([expectedUrl, expectedUrl]);
    expect(authorization(calls[1]!)).toBe("Bearer staging-fixture-token");
  });

  test("rejects a non-dedicated canary before fetch", async () => {
    const config = JSON.parse(String(stagingEnvironment().GHOSTINIT_STAGING_CONFIG)) as Record<
      string,
      unknown
    >;
    config.canary = "production";
    let contacted = false;
    await expect(
      runExternalReadinessTarget("staging", {
        environment: { ...enabled, GHOSTINIT_STAGING_CONFIG: JSON.stringify(config) },
        fetchImpl: async () => {
          contacted = true;
          return denied();
        },
      }),
    ).rejects.toThrow("dedicated external-readiness resource");
    expect(contacted).toBe(false);
  });

  test("bounds requests, aborts on timeout, and releases the request", async () => {
    let aborted = false;
    const fetchImpl: FetchLike = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    await expect(
      runExternalReadinessTarget("staging", {
        environment: stagingEnvironment(),
        fetchImpl,
        timeoutMs: 5,
      }),
    ).rejects.toThrow("timed out after 5ms");
    expect(aborted).toBe(true);
  });

  test("redacts opaque config fields and encoded credentials and removes log injection", async () => {
    const secret = "sk_test_opaque/value+with=symbols";
    let thrown: Error | undefined;
    let request = 0;
    try {
      await runExternalReadinessTarget("stripe", {
        environment: { ...enabled, STRIPE_SECRET_KEY: secret },
        fetchImpl: async () => {
          request += 1;
          if (request === 1) return denied();
          throw new Error(
            `transport rejected ${secret} and ${encodeURIComponent(secret)}\n::error::injected`,
          );
        },
      });
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toContain("***");
    expect(thrown?.message).not.toContain(secret);
    expect(thrown?.message).not.toContain(encodeURIComponent(secret));
    expect(thrown?.message).not.toContain("\n");

    const config = String(stagingEnvironment().GHOSTINIT_STAGING_CONFIG);
    const safe = sanitizeExternalFailure(new Error(`failure ${config} staging-fixture-token`), [
      config,
      "staging-fixture-token",
    ]);
    expect(safe).not.toContain(config);
    expect(safe).not.toContain("staging-fixture-token");
  });

  test("never prints HTTP error bodies", async () => {
    const bodySecret = "body-only-sensitive-value";
    let request = 0;
    let thrown: unknown;
    try {
      await runExternalReadinessTarget("stripe", {
        environment: { ...enabled, STRIPE_SECRET_KEY: "sk_test_safe_fixture_value" },
        fetchImpl: async () => {
          request += 1;
          return request === 1 ? denied() : json({ error: bodySecret }, 401);
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).toContain("returned HTTP 401");
    expect(String(thrown)).not.toContain(bodySecret);
  });

  test("cancels an oversized response stream", async () => {
    let cancelled = false;
    let request = 0;
    const fetchImpl: FetchLike = async () => {
      request += 1;
      if (request === 1) return denied();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(64 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, { headers: { "Content-Type": "application/json" } });
    };
    await expect(
      runExternalReadinessTarget("stripe", {
        environment: { ...enabled, STRIPE_SECRET_KEY: "sk_test_safe_fixture_value" },
        fetchImpl,
      }),
    ).rejects.toThrow("response exceeded 65536 bytes");
    expect(cancelled).toBe(true);
  });
});

test("Upstash proves anonymous denial, uses a TTL key, and confirms cleanup", async () => {
  const { calls, fetchImpl } = captureFetch((_request, index) => {
    if (index === 0) return denied();
    if (index === 1) return json({ result: canaries.upstash });
    return index === 2 ? json([{ result: "OK" }, { result: "probe-run-1" }]) : json({ result: 1 });
  });
  await expect(
    runExternalReadinessTarget("upstash", {
      environment: upstashEnvironment(),
      fetchImpl,
      nonce: () => "run-1",
      now: () => 10,
    }),
  ).resolves.toEqual({ target: "upstash", durationMs: 0 });

  expect(calls).toHaveLength(4);
  expect(calls.map(({ url }) => url)).toEqual([
    "https://fixture.upstash.io/",
    "https://fixture.upstash.io/",
    "https://fixture.upstash.io/pipeline",
    "https://fixture.upstash.io/",
  ]);
  expect(authorization(calls[0]!)).toBeNull();
  expect(
    calls.slice(1).every((request) => authorization(request) === "Bearer upstash-fixture-token"),
  ).toBe(true);
  expect(JSON.parse(String(calls[2]?.init.body))).toEqual([
    ["SET", "ghostinit:external-readiness:run-1", "probe-run-1", "EX", 60],
    ["GET", "ghostinit:external-readiness:run-1"],
  ]);
  expect(JSON.parse(String(calls[3]?.init.body))).toEqual([
    "DEL",
    "ghostinit:external-readiness:run-1",
  ]);
});

test("Upstash cleanup uncertainty is blocking", async () => {
  const { fetchImpl } = captureFetch((_request, index) => {
    if (index === 0) return denied();
    if (index === 1) return json({ result: canaries.upstash });
    return index === 2 ? json([{ result: "OK" }, { result: "wrong" }]) : json({}, 503);
  });
  await expect(
    runExternalReadinessTarget("upstash", {
      environment: upstashEnvironment(),
      fetchImpl,
      nonce: () => "cleanup",
    }),
  ).rejects.toThrow("cleanup could not be confirmed");
});

test("Upstash refuses to write when the dedicated resource canary differs", async () => {
  const { calls, fetchImpl } = captureFetch((_request, index) =>
    index === 0 ? denied() : json({ result: "production" }),
  );
  await expect(
    runExternalReadinessTarget("upstash", {
      environment: upstashEnvironment(),
      fetchImpl,
    }),
  ).rejects.toThrow("refusing to write");
  expect(calls).toHaveLength(2);
  expect(calls.every(({ init }) => !String(init.body).includes("SET"))).toBe(true);
});

describe("read-only provider contracts", () => {
  const cases: Array<{
    target: Exclude<ExternalReadinessTarget, "upstash" | "staging">;
    environment: ReadinessEnvironment;
    url: string;
    anonymousResponse: unknown | "denied";
    response: unknown;
    body?: unknown;
  }> = [
    {
      target: "convex",
      environment: convexEnvironment(),
      url: "https://fixture.convex.cloud/api/query",
      anonymousResponse: {
        status: "success",
        value: { authenticated: false, canary: canaries.convex },
      },
      response: {
        status: "success",
        value: { authenticated: true, canary: canaries.convex },
      },
      body: { path: "health:check", args: {}, format: "json" },
    },
    {
      target: "stripe",
      environment: { ...enabled, STRIPE_SECRET_KEY: "sk_test_fixture_value" },
      url: "https://api.stripe.com/v1/balance",
      anonymousResponse: "denied",
      response: { object: "balance", livemode: false, available: [], pending: [] },
    },
    {
      target: "chargily",
      environment: {
        ...enabled,
        CHARGILY_API_KEY: "chargily-fixture-key",
        CHARGILY_MODE: "test",
      },
      url: "https://pay.chargily.net/test/api/v2/balance",
      anonymousResponse: "denied",
      response: {
        entity: "balance",
        livemode: false,
        wallets: [{ currency: "dzd", balance: 0, ready_for_payout: 0, on_hold: 0 }],
      },
    },
    {
      target: "paddle",
      environment: {
        ...enabled,
        PADDLE_API_KEY: "pdl_sdbx_apikey_fixture_value",
        PADDLE_ENVIRONMENT: "sandbox",
      },
      url: "https://sandbox-api.paddle.com/event-types",
      anonymousResponse: "denied",
      response: {
        data: [
          {
            name: "transaction.created",
            description: "A transaction was created",
            group: "Transaction",
            available_versions: [1],
          },
        ],
      },
    },
    {
      target: "polar",
      environment: {
        ...enabled,
        POLAR_ACCESS_TOKEN: "polar_oat_fixture_token",
        POLAR_ENVIRONMENT: "sandbox",
      },
      url: "https://sandbox-api.polar.sh/v1/organizations?limit=1",
      anonymousResponse: "denied",
      response: { items: [], pagination: { total_count: 0, max_page: 0 } },
    },
  ];

  for (const fixture of cases) {
    test(`${fixture.target} proves auth separation and its bounded read contract`, async () => {
      const { calls, fetchImpl } = captureFetch((_request, index) => {
        if (index === 0) {
          return fixture.anonymousResponse === "denied"
            ? denied()
            : json(fixture.anonymousResponse);
        }
        return json(fixture.response);
      });
      await runExternalReadinessTarget(fixture.target, {
        environment: fixture.environment,
        fetchImpl,
      });
      expect(calls).toHaveLength(2);
      expect(calls.map(({ url }) => url)).toEqual([fixture.url, fixture.url]);
      expect(authorization(calls[0]!)).toBeNull();
      expect(authorization(calls[1]!)).toMatch(/^Bearer /);
      expect(calls.every(({ init }) => init.redirect === "error")).toBe(true);
      expect(calls.every(({ init }) => init.signal instanceof AbortSignal)).toBe(true);
      if (fixture.body) {
        expect(JSON.parse(String(calls[0]?.init.body))).toEqual(fixture.body);
        expect(JSON.parse(String(calls[1]?.init.body))).toEqual(fixture.body);
      }
    });
  }
});

test("HTTP-200 error-shaped responses cannot report readiness", async () => {
  const { fetchImpl: convexFetch } = captureFetch(() =>
    json({ status: "success", value: { authenticated: true, canary: canaries.convex } }),
  );
  await expect(
    runExternalReadinessTarget("convex", {
      environment: convexEnvironment(),
      fetchImpl: convexFetch,
    }),
  ).rejects.toThrow("anonymous negative control");

  const providerCases: Array<{
    target: "stripe" | "chargily" | "paddle" | "polar";
    environment: ReadinessEnvironment;
  }> = [
    {
      target: "stripe",
      environment: { ...enabled, STRIPE_SECRET_KEY: "sk_test_fixture_value" },
    },
    {
      target: "chargily",
      environment: { ...enabled, CHARGILY_API_KEY: "chargily-key", CHARGILY_MODE: "test" },
    },
    {
      target: "paddle",
      environment: {
        ...enabled,
        PADDLE_API_KEY: "pdl_sdbx_apikey_fixture_value",
        PADDLE_ENVIRONMENT: "sandbox",
      },
    },
    {
      target: "polar",
      environment: {
        ...enabled,
        POLAR_ACCESS_TOKEN: "polar_oat_fixture_token",
        POLAR_ENVIRONMENT: "sandbox",
      },
    },
  ];
  for (const fixture of providerCases) {
    const { fetchImpl } = captureFetch((_request, index) =>
      index === 0 ? denied() : json({ error: { code: "fixture" } }),
    );
    await expect(
      runExternalReadinessTarget(fixture.target, {
        environment: fixture.environment,
        fetchImpl,
      }),
    ).rejects.toThrow("unexpected");
  }
});

test("staging proves anonymous denial and an exact staging canary response", async () => {
  const { calls, fetchImpl } = captureFetch((_request, index) =>
    index === 0
      ? denied(403)
      : json({ status: "ok", environment: "staging", canary: canaries.staging }),
  );
  await runExternalReadinessTarget("staging", {
    environment: stagingEnvironment(),
    fetchImpl,
  });
  expect(calls).toHaveLength(2);
  expect(authorization(calls[0]!)).toBeNull();
  expect(authorization(calls[1]!)).toBe("Bearer staging-fixture-token");

  const { fetchImpl: badFetch } = captureFetch((_request, index) =>
    index === 0
      ? denied()
      : json({ status: "ok", environment: "production", canary: canaries.staging }),
  );
  await expect(
    runExternalReadinessTarget("staging", {
      environment: stagingEnvironment(),
      fetchImpl: badFetch,
    }),
  ).rejects.toThrow("did not prove the protected deployment canary");
});
