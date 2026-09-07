export const NEXT_DEVELOPMENT_MEMORY_CONFIG = `  experimental: {
    // Limit local prerender worker copies; CI keeps Next's default parallelism.
    ...(process.env.CI ? {} : { cpus: 2 }),
    // Reclaim persisted compiler cache between local development snapshots.
    turbopackMemoryEviction:
      process.env.NODE_ENV === "development" && !process.env.CI ? "full" : "auto",
  },`;
