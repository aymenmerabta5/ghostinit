/**
 * @deprecated - split into monorepo/ folder for 10/10 modular architecture.
 * This shim re-exports from ./monorepo/index.js for backwards compatibility.
 * Original 809 LOC god file now decomposed into single-responsibility composers.
 */

export * from "./monorepo/index.js";
export { monorepoFiles } from "./monorepo/index.js";
export { monorepoFiles as default } from "./monorepo/index.js";
