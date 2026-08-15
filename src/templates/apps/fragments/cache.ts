/**
 * TanStack cache fragment — Nitro cachedEventHandler example
 * Used when --with-cache (Upstash Redis) is enabled
 */

export function tanstackCacheContent(): string {
  return `import { defineCachedEventHandler } from "nitropack/runtime";

export const cachedHandler = defineCachedEventHandler(
  async (event) => {
    // Example: cache dashboard data for 60s, revalidate via cacheTags
    return { data: "cached", time: new Date().toISOString() };
  },
  { maxAge: 60, swr: true, name: "dashboard", group: "api" }
);
`;
}
