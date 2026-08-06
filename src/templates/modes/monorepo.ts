/**
 * @deprecated - split into monorepo/ folder for 10/10 modular architecture.
 * This shim re-exports from ./monorepo/index.js for backwards compatibility.
 * Original 809 LOC god file now decomposed into single-responsibility composers.
 */

// Explicit re-exports only — no `export *` per host guideline
export { monorepoFiles, monorepoTemplateFiles } from "./monorepo/index.js";
export { monorepoFiles as default } from "./monorepo/index.js";
