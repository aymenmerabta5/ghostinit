/**
 * Header fragments shim — split 312 LOC file into header/ folder (<150 each).
 * Keeps backwards-compatible import path "./fragments/header.js".
 */
export type { RouterType } from "./header/shared.js";
export {
  getInitialsFunction,
  getInitialsTanstackVariant,
  sharedHeaderStructure,
} from "./header/shared.js";
export { headerFileContent } from "./header/header.js";
export { signOutButtonContent, adminGuardContent } from "./header/guards.js";
