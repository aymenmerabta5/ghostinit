/**
 * Root templates shim — split 483 LOC god file into root/ folder <100 each.
 */
// Explicit re-exports only — no `export *`
export { rootFiles } from "./root/index.js";
export type { RootSecrets } from "./root/secrets.js";
export { billingEnvPlaceholders } from "./root/secrets.js";
export { envExampleContent, envLocalContent, envPlaceholderContent } from "./shared/env.js";
