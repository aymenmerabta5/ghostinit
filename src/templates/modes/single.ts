/**
 * DEPRECATED: god file split into single/ folder for 10/10 architecture.
 * Original 4306 LOC file violated own <300 rule.
 * Now shim that re-exports modular implementation.
 * Keeps backwards compat for src/templates/default.ts which imports from modes/single.
 */
export {
  singleFiles,
  singleTemplateFiles,
  buildSecrets,
  selectedBillingFromAddons,
} from "./single/index.js";
export * from "./single/index.js";
export { default } from "./single/index.js";
