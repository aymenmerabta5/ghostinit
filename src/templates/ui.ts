/**
 * Compat shim — original god file split into src/templates/ui/ modular folder.
 * Preserves uiPackage API used by modes/monorepo.ts.
 */

export { uiPackage } from "./ui/index.js";
export * from "./ui/index.js";

// Legacy aliases
export { uiPackage as uiFiles } from "./ui/index.js";
export { uiPackage as uiTemplateFiles } from "./ui/index.js";
