import { describe, expect, test } from "bun:test";
import { apiPackage } from "../../src/templates/api.js";
import { apiRateLimitContent } from "../../src/templates/api/rate-limit.js";
import { singleAdminApiFiles } from "../../src/templates/modes/single/api/admin.js";
import { singleBillingApiFiles } from "../../src/templates/modes/single/api/billing.js";
import { requestApplicationFiles } from "../../src/templates/services/application.js";

class HarnessORPCError extends Error {
  readonly code: string;

  constructor(code: string, options: { message?: string; cause?: unknown } = {}) {
    super(options.message, { cause: options.cause });
    this.code = code;
  }
}

type RateLimit = (key: string, limit?: number, windowMs?: number) => Promise<void>;

function loadRateLimit(
  env: Record<string, string | undefined>,
  fetchImplementation: typeof fetch = fetch,
  abortSignal: typeof AbortSignal = AbortSignal,
): RateLimit {
  const source = apiRateLimitContent()
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  return new Function(
    "ORPCError",
    "process",
    "fetch",
    "AbortSignal",
    `${javascript}; return rateLimit;`,
  )(HarnessORPCError, { env }, fetchImplementation, abortSignal) as RateLimit;
}

async function errorCode(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    return error instanceof HarnessORPCError ? error.code : undefined;
  }
}

describe("generated API rate-limit security", () => {
  test("development fallback is bounded and enforces the configured bucket", async () => {
    for (const environment of [
      { NODE_ENV: "development" },
      {
        NODE_ENV: "development",
        UPSTASH_REDIS_REST_URL: "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
        UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
      },
    ]) {
      const rateLimit = loadRateLimit(environment);
      await rateLimit("admin:list:actor", 2, 60_000);
      await rateLimit("admin:list:actor", 2, 60_000);
      expect(await errorCode(rateLimit("admin:list:actor", 2, 60_000))).toBe("TOO_MANY_REQUESTS");
    }
  });

  test("production fails closed when shared state is absent or unsafe", async () => {
    const unsafeEnvironments = [
      {},
      { NODE_ENV: "production" },
      { NODE_ENV: "development", VERCEL: "1" },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
        UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
      },
      {
        NODE_ENV: "development",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
      },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "http://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "http://127.0.0.1:8079",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://user@redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test/base",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test?redirect=evil",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: " credential ",
      },
    ] satisfies Array<Record<string, string>>;

    for (const environment of unsafeEnvironments) {
      let requests = 0;
      const rateLimit = loadRateLimit(environment, (async () => {
        requests += 1;
        return Response.json([{ result: [1, 60_000] }]);
      }) as typeof fetch);
      expect(await errorCode(rateLimit("billing:actor"))).toBe("SERVICE_UNAVAILABLE");
      expect(requests).toBe(0);
    }
  });

  test("permits explicit loopback HTTP only for development and test", async () => {
    for (const nodeEnvironment of ["development", "test"] as const) {
      let endpoint = "";
      const rateLimit = loadRateLimit(
        {
          NODE_ENV: nodeEnvironment,
          UPSTASH_REDIS_REST_URL: "http://127.0.0.2:8079/",
          UPSTASH_REDIS_REST_TOKEN: "credential",
        },
        (async (input) => {
          endpoint = String(input);
          return Response.json([{ result: [1, 1_000] }]);
        }) as typeof fetch,
      );
      await rateLimit("loopback", 2, 1_000);
      expect(endpoint).toBe("http://127.0.0.2:8079/pipeline");
    }
  });

  test("uses one atomic shared increment with a deadline and never falls back on failure", async () => {
    let request: { input: string; init?: RequestInit } | undefined;
    let deadline = 0;
    const rateLimit = loadRateLimit(
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      (async (input, init) => {
        request = { input: String(input), init };
        return Response.json([{ result: [1, 60_000] }]);
      }) as typeof fetch,
      {
        timeout(milliseconds: number) {
          deadline = milliseconds;
          return new AbortController().signal;
        },
      } as typeof AbortSignal,
    );

    await rateLimit("billing:checkout:actor", 10, 60_000);

    expect(request?.input).toBe("https://redis.example.test/pipeline");
    expect(request?.init?.method).toBe("POST");
    expect(request?.init?.redirect).toBe("error");
    expect(request?.init?.cache).toBe("no-store");
    expect(new Headers(request?.init?.headers).get("Authorization")).toBe("Bearer credential");
    expect(request?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(deadline).toBe(2_500);
    const pipeline = JSON.parse(String(request?.init?.body)) as unknown[][];
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0]).toHaveLength(5);
    expect(pipeline[0]?.[0]).toBe("EVAL");
    expect(pipeline[0]?.[2]).toBe(1);
    expect(pipeline[0]?.[3]).toBe("ghostinit:api-rate:billing:checkout:actor");
    expect(pipeline[0]?.[4]).toBe("60000");
    expect(pipeline[0]?.[1]).toContain("redis.call('INCR', KEYS[1])");
    expect(pipeline[0]?.[1]).toContain("redis.call('PEXPIRE', KEYS[1], window)");
    expect(pipeline[0]?.[1]).toContain("count == 1 or ttl < 0");

    const unavailable = loadRateLimit(
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      (async () => {
        throw new Error("offline");
      }) as typeof fetch,
    );
    expect(await errorCode(unavailable("billing:checkout:actor"))).toBe("SERVICE_UNAVAILABLE");
  });

  test("rejects an over-limit shared counter", async () => {
    const rateLimit = loadRateLimit(
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      (async () => Response.json([{ result: [3, 60_000] }])) as typeof fetch,
    );

    expect(await errorCode(rateLimit("admin:ban:actor", 2, 60_000))).toBe("TOO_MANY_REQUESTS");
  });

  test("rejects Upstash command errors and malformed pipeline results", async () => {
    const payloads: unknown[] = [
      { result: [1, 60_000] },
      [],
      [{ error: "ERR script rejected" }],
      [{ result: [1] }],
      [{ result: ["1", 60_000] }],
      [{ result: [1, -1] }],
      [{ result: [1, 60_001] }],
      [{ result: [1, 60_000] }, { result: [2, 60_000] }],
    ];
    for (const payload of payloads) {
      const rateLimit = loadRateLimit(
        {
          NODE_ENV: "production",
          UPSTASH_REDIS_REST_URL: "https://redis.example.test",
          UPSTASH_REDIS_REST_TOKEN: "credential",
        },
        (async () => Response.json(payload)) as typeof fetch,
      );
      expect(await errorCode(rateLimit("admin:ban:actor", 2, 60_000))).toBe("SERVICE_UNAVAILABLE");
    }

    for (const response of [
      new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response("upstream unavailable", { status: 503 }),
    ]) {
      const rateLimit = loadRateLimit(
        {
          NODE_ENV: "production",
          UPSTASH_REDIS_REST_URL: "https://redis.example.test",
          UPSTASH_REDIS_REST_TOKEN: "credential",
        },
        (async () => response) as typeof fetch,
      );
      expect(await errorCode(rateLimit("admin:ban:actor", 2, 60_000))).toBe("SERVICE_UNAVAILABLE");
    }
  });

  test("bounds caller-controlled policy inputs before any shared request", async () => {
    let requests = 0;
    const rateLimit = loadRateLimit(
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "credential",
      },
      (async () => {
        requests += 1;
        return Response.json([{ result: [1, 1] }]);
      }) as typeof fetch,
    );
    for (const operation of [
      () => rateLimit("", 1, 1),
      () => rateLimit("x".repeat(513), 1, 1),
      () => rateLimit("key", 1_000_001, 1),
      () => rateLimit("key", 1, 86_400_001),
    ]) {
      expect(await errorCode(operation())).toBe("SERVICE_UNAVAILABLE");
    }
    expect(requests).toBe(0);
  });

  test("keeps limiter ownership in the facade and declares every resulting oRPC failure", () => {
    const files = [
      ...apiPackage(true, false, true, false),
      ...singleAdminApiFiles(),
      ...singleBillingApiFiles(),
    ];
    const consumers = files.filter(
      ({ path, content }) =>
        (/\/procedures\/(?:admin|billing)\//.test(path) ||
          /\/api\/(?:admin|billing)\//.test(path)) &&
        content.includes("context.application."),
    );
    expect(consumers).toHaveLength(16);
    for (const { path, content } of consumers) {
      expect(content, path).toContain('TOO_MANY_REQUESTS: { message: "Too many requests" }');
      expect(content, path).toContain(
        'SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" }',
      );
      expect(content, path).not.toContain("await rateLimit");
    }
    for (const mode of ["monorepo", "single"] as const) {
      const facade = requestApplicationFiles(
        mode,
        { admin: true, billing: true, identity: false, notifications: false },
        "",
      ).find(({ path }) => path.endsWith("/application/facade.ts"))?.content;
      expect(facade).toBeDefined();
      expect(facade?.match(/await dependencies\.rateLimit\(/g)).toHaveLength(8);
    }
  });
});
