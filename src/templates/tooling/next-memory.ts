export const NEXT_DEVELOPMENT_MEMORY_CONFIG = `  experimental: {
    // Reclaim persisted compiler cache between local development snapshots.
    turbopackMemoryEviction:
      process.env.NODE_ENV === "development" && !process.env.CI ? "full" : "auto",
  },`;
