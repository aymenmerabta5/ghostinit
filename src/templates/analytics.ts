/**
 * Compat shim — original god file split into src/templates/analytics/ modular folder.
 * Re-exports for existing imports: monorepo.ts and single.ts use analyticsFiles.
 */

export { analyticsFiles } from "./analytics/index.js";
export * from "./analytics/index.js";

// Keep legacy named exports for any direct consumers
export { analyticsFiles as analyticsPackage } from "./analytics/index.js";
export { analyticsFiles as analyticsTemplateFiles } from "./analytics/index.js";
