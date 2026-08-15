// @allow-long 180: instrumentation fragment shared Next/TanStack
/**
 * Instrumentation — Next instrumentation.ts + TanStack app instrumentation
 * Hooks @repo/observability for request logging, tracing.
 */

export function nextInstrumentationContent(): string {
  return `export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logger } = await import("@repo/observability");
    logger.info("[instrumentation] Next.js instrumentation registered");
  }
}
`;
}

export function tanstackInstrumentationContent(): string {
  return `export async function register(): Promise<void> {
  // TanStack Start instrumentation — hooks observability for Nitro
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
    const { logger } = await import("@repo/observability");
    logger.info("[instrumentation] TanStack Start instrumentation registered");
  }
}
`;
}
