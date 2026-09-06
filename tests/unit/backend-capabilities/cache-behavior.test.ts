import { Redis } from "@upstash/redis";
import { describe, expect, test } from "bun:test";
import { cache as versions } from "../../../packages/versions/src/index.js";
import { singleCacheFiles } from "../../../src/templates/modes/single/cache.js";
import { cacheComposerFiles } from "../../../src/templates/modes/monorepo/cache-composer.js";
import { startRedisRestFixture } from "../../helpers/redis-rest-fixture.js";

interface GeneratedCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ttl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  withCache<T>(key: string, load: () => Promise<T>, options?: { ttl?: number }): Promise<T>;
}

function generatedCache(mode: "monorepo" | "single"): GeneratedCache {
  const source =
    mode === "single"
      ? singleCacheFiles().find((file) => file.path === "src/server/cache.ts")!.content
      : cacheComposerFiles().find((file) => file.path === "packages/cache/src/index.ts")!.content;
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace('import { Redis } from "@upstash/redis";', "").replace(/^export /gm, ""),
  );
  // Only configuration is bound locally; Redis is the real installed SDK class.
  return new Function("Redis", "globalThis", executable + "; return cache;")(Redis, {
    process: {
      env: {
        UPSTASH_REDIS_REST_URL: "https://redis.fixture.invalid",
        UPSTASH_REDIS_REST_TOKEN: "fixture-only-token",
      },
    },
  }) as GeneratedCache;
}

describe("generated cache success boundary", () => {
  test("stores and retrieves values with expiry and scoped invalidation through the pinned Redis SDK", async () => {
    const manifest = await Bun.file(new URL("../../../package.json", import.meta.url)).json();
    expect(manifest.devDependencies["@upstash/redis"]).toBe(versions["@upstash/redis"]);
    const installed = await Bun.file(
      new URL("./package.json", import.meta.resolve("@upstash/redis")),
    ).json();
    expect(installed.version).toBe(versions["@upstash/redis"]);
    const fixture = startRedisRestFixture();
    const originalFetch = globalThis.fetch;
    // The generated configuration still requires HTTPS. This shim routes only
    // its reserved test hostname to loopback HTTP; it does not attest DNS/TLS,
    // Redis persistence, or a hosted Upstash deployment. No other URL is altered.
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const source = input instanceof Request ? input.url : String(input);
      const url = new URL(source);
      if (url.origin !== "https://redis.fixture.invalid") return originalFetch(input, init);
      return originalFetch(new URL(url.pathname, fixture.url), {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(2_000),
      });
    }) as typeof fetch;
    try {
      for (const mode of ["monorepo", "single"] as const) {
        const cache = generatedCache(mode);
        const owned = `${mode}:owner-a:`;
        const other = `${mode}:owner-b:`;
        expect(await cache.get(owned + "missing")).toBeNull();
        const value = { owner: "a", revision: 1, nested: ["retained", 0, false] };
        await cache.set(owned + "value", value);
        expect(await cache.get(owned + "value")).toEqual(value);
        await cache.set(other + "value", { owner: "b" });
        expect(await cache.get(other + "value")).toEqual({ owner: "b" });
        await cache.set(owned + "false", false);
        expect(
          await cache.withCache(owned + "false", async () => {
            throw new Error("false is a hit");
          }),
        ).toBe(false);
        let loads = 0;
        const load = async () => ({ loaded: ++loads });
        expect(await cache.withCache(owned + "loaded", load)).toEqual({ loaded: 1 });
        expect(await cache.withCache(owned + "loaded", load)).toEqual({ loaded: 1 });
        expect(loads).toBe(1);
        await cache.set(owned + "expires", { temporary: true }, { ttl: 1 });
        expect(await cache.get(owned + "expires")).toEqual({ temporary: true });
        await Bun.sleep(1_100);
        expect(await cache.get(owned + "expires")).toBeNull();
        const beforeInvalidTtl = fixture.commands.length;
        await expect(cache.set(owned + "invalid", "value", { ttl: 0 })).rejects.toBeInstanceOf(
          RangeError,
        );
        expect(fixture.commands).toHaveLength(beforeInvalidTtl);
        await cache.set(owned + "delete", "temporary");
        await cache.delete(owned + "delete");
        expect(await cache.get(owned + "delete")).toBeNull();
        await cache.invalidate(owned + "*");
        expect(await cache.get(owned + "value")).toBeNull();
        expect(await cache.get(owned + "false")).toBeNull();
        expect(await cache.get(owned + "loaded")).toBeNull();
        expect(await cache.get(other + "value")).toEqual({ owner: "b" });
        expect(
          fixture.commands.some(
            (command) =>
              String(command[0]).toUpperCase() === "SET" &&
              command[1] === owned + "expires" &&
              String(command[3]).toUpperCase() === "EX" &&
              command[4] === 1,
          ),
        ).toBe(true);
        expect(
          fixture.commands.filter(
            (command) =>
              String(command[0]).toUpperCase() === "SCAN" && command.includes(owned + "*"),
          ).length,
        ).toBeGreaterThan(1);
      }
    } finally {
      globalThis.fetch = originalFetch;
      await fixture.server.stop(true);
    }
  });
});
