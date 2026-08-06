import type { TemplateFile } from "../../shared.js";
import { file, packageJson, tsconfig, codeScripts } from "../../shared.js";
import * as v from "../../versions.js";

type Runtime = "node" | "bun";

export function cacheComposerFiles(runtime: Runtime = "bun"): TemplateFile[] {
  return [
    file(
      "packages/cache/package.json",
      packageJson({
        name: "@repo/cache",
        type: "module",
        scripts: codeScripts(),
        exports: { ".": "./src/index.ts" },
        dependencies: {
          "@upstash/redis": `^${v.cache["@upstash/redis"]}`,
          "@repo/config": "workspace:*",
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
          ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
        },
      }),
    ),
    file(
      "packages/cache/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          composite: true,
          incremental: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          outDir: "./dist",
          rootDir: "./src",
        },
      }),
    ),
    file(
      "packages/cache/src/memory.ts",
      `const mem = new Map<string, { value: unknown; expiresAt?: number }>();
export async function memoryGet<T>(key: string): Promise<T | null> {
  const entry = mem.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    mem.delete(key);
    return null;
  }
  return entry.value as T;
}
export async function memorySet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
  mem.set(key, { value, expiresAt });
}
export async function memoryDelete(key: string): Promise<void> {
  mem.delete(key);
}
export async function memoryInvalidate(pattern: string): Promise<void> {
  const re = new RegExp(pattern.replace(/\\*/g, ".*"));
  for (const k of [...mem.keys()]) if (re.test(k)) mem.delete(k);
}
`,
    ),
    file(
      "packages/cache/src/upstash.ts",
      `import { Redis } from "@upstash/redis";
import { env } from "@repo/config";

function isPlaceholder(v?: string): boolean {
  return !v || v.startsWith("REPLACE_WITH");
}

let client: Redis | null = null;
function getClient(): Redis | null {
  if (client) return client;
  const url = env.UPSTASH_REDIS_REST_URL as string | undefined;
  const token = env.UPSTASH_REDIS_REST_TOKEN as string | undefined;
  if (isPlaceholder(url) || isPlaceholder(token) || !url || !token) return null;
  client = new Redis({ url, token });
  return client;
}

export async function upstashGet<T>(key: string): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  try { return (await c.get<T>(key)) ?? null; } catch { return null; }
}
export async function upstashSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    if (ttlSeconds) await c.set(key, value as never, { ex: ttlSeconds });
    else await c.set(key, value as never);
  } catch {}
}
export async function upstashDelete(key: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try { await c.del(key); } catch {}
}
export async function upstashInvalidate(pattern: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    // Upstash scan not always available; fallback to keys via scan
    // @ts-expect-error scan may not be typed
    if (typeof c.scan === "function") {
      let cursor = 0;
      do {
        const res: unknown = await (c as unknown as { scan: (cursor: number, opts?: { match: string }) => Promise<[number, string[]]> }).scan(cursor, { match: pattern });
        const [next, keys] = res as [number, string[]];
        if (keys?.length) await c.del(...keys);
        cursor = next;
      } while (cursor !== 0);
    }
  } catch {}
}
export function isUpstashEnabled(): boolean {
  return getClient() !== null;
}
`,
    ),
    file(
      "packages/cache/src/index.ts",
      `import { memoryGet, memorySet, memoryDelete, memoryInvalidate } from "./memory.js";
import { upstashGet, upstashSet, upstashDelete, upstashInvalidate, isUpstashEnabled } from "./upstash.js";

export interface CacheOptions {
  ttl?: number;
}

function useUpstash(): boolean {
  try { return isUpstashEnabled(); } catch { return false; }
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (useUpstash()) {
      const v = await upstashGet<T>(key);
      if (v !== null) return v;
    }
    return memoryGet<T>(key);
  },
  async set(key: string, value: unknown, opts?: CacheOptions): Promise<void> {
    if (useUpstash()) await upstashSet(key, value, opts?.ttl);
    await memorySet(key, value, opts?.ttl);
  },
  async delete(key: string): Promise<void> {
    if (useUpstash()) await upstashDelete(key);
    await memoryDelete(key);
  },
  async invalidate(pattern: string): Promise<void> {
    if (useUpstash()) await upstashInvalidate(pattern);
    await memoryInvalidate(pattern);
  },
  async withCache<T>(key: string, fn: () => Promise<T>, opts?: CacheOptions): Promise<T> {
    const cached = await cache.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fn();
    await cache.set(key, fresh, opts);
    return fresh;
  },
};

export { isUpstashEnabled } from "./upstash.js";
`,
    ),
  ];
}
