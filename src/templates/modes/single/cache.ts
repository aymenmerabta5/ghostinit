import { file, type TemplateFile } from "../../shared.js";

/**
 * Flat single-mode Redis cache.
 *
 * A selected remote cache must never silently degrade to process-local memory:
 * that makes invalidation and rate/coordination semantics differ by instance.
 * Configuration and provider failures therefore propagate to the caller.
 */
export function singleCacheFiles(): TemplateFile[] {
  return [
    file(
      "src/server/cache.ts",
      `import { Redis } from "@upstash/redis";

export interface CacheOptions {
  readonly ttl?: number;
}

export class CacheConfigurationError extends Error {
  override readonly name = "CacheConfigurationError";
}

export class CacheProviderError extends Error {
  override readonly name = "CacheProviderError";

  constructor(operation: string, cause: unknown) {
    super(\`Redis cache operation failed: \${operation}\`, { cause });
  }
}

let client: Redis | undefined;

type CacheEnvironment = Record<
  "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN",
  string | undefined
>;

function requiredEnvironment(name: "UPSTASH_REDIS_REST_URL" | "UPSTASH_REDIS_REST_TOKEN"): string {
  const processLike = (globalThis as { process?: { env?: Partial<CacheEnvironment> } }).process;
  const value = processLike?.env?.[name]?.trim();
  if (!value || value.startsWith("REPLACE_WITH")) {
    throw new CacheConfigurationError(\`\${name} must be configured when cache=redis\`);
  }
  return value;
}

function redis(): Redis {
  if (client) return client;
  const url = requiredEnvironment("UPSTASH_REDIS_REST_URL");
  const token = requiredEnvironment("UPSTASH_REDIS_REST_TOKEN");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new CacheConfigurationError("UPSTASH_REDIS_REST_URL must be a valid URL", { cause });
  }
  if (parsed.protocol !== "https:") {
    throw new CacheConfigurationError("UPSTASH_REDIS_REST_URL must use HTTPS");
  }
  client = new Redis({ url: parsed.toString(), token });
  return client;
}

function expiration(ttl: number | undefined): { ex: number } | undefined {
  if (ttl === undefined) return undefined;
  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw new RangeError("Cache ttl must be a positive integer number of seconds");
  }
  return { ex: ttl };
}

async function providerOperation<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof CacheConfigurationError || cause instanceof RangeError) throw cause;
    throw new CacheProviderError(operation, cause);
  }
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    return providerOperation("get", async () => (await redis().get<T>(key)) ?? null);
  },

  async set(key: string, value: unknown, options?: CacheOptions): Promise<void> {
    await providerOperation("set", async () => {
      const expires = expiration(options?.ttl);
      if (expires) await redis().set(key, value as never, expires);
      else await redis().set(key, value as never);
    });
  },

  async delete(key: string): Promise<void> {
    await providerOperation("delete", async () => {
      await redis().del(key);
    });
  },

  async invalidate(pattern: string): Promise<void> {
    if (!pattern.trim()) throw new RangeError("Cache invalidation pattern must not be empty");
    await providerOperation("invalidate", async () => {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis().scan(cursor, { match: pattern, count: 100 });
        if (keys.length > 0) await redis().del(...keys);
        cursor = nextCursor;
      } while (cursor !== "0");
    });
  },

  async withCache<T>(key: string, load: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;
    const value = await load();
    await cache.set(key, value, options);
    return value;
  },
};
`,
    ),
  ];
}
