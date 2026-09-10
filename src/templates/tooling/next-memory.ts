export function nextMemoryExperimentalConfig(hasCloudflare: boolean): string {
  // Native builds release compiler workers before starting the TypeScript CLI.
  const buildWorker = hasCloudflare ? "" : "    webpackBuildWorker: true,\n";
  return `  experimental: {
${buildWorker}    // Limit local prerender worker copies; CI keeps Next's default parallelism.
    ...(process.env.CI ? {} : { cpus: 2 }),
    // Reclaim persisted compiler cache between local development snapshots.
    turbopackMemoryEviction:
      process.env.NODE_ENV === "development" && !process.env.CI ? "full" : "auto",
  },`;
}
