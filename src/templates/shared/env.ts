/**
 * Env shim — split 449 LOC god file into env/ folder <300 each.
 */
export * from "./env/index.js";
export {
  billingEnvLines,
  billingEnvLocalLines,
  billingEnvLocalLinesFiltered,
} from "./env/billing.js";
export {
  coreEnvExampleLines,
  coreEnvLocalLines,
  resendExampleLines,
  resendLocalLines,
} from "./env/core.js";
export {
  envExampleContent,
  envPlaceholderContent,
  envLocalContent,
  filteredEnvExample,
  filteredEnvLocal,
} from "./env/builders.js";
export const Placeholders = { BETTER_AUTH_SECRET: "REPLACE_WITH_SECRET" } as any;
import { ENV_PLACEHOLDERS } from "../../lib/constants.js";
export { ENV_PLACEHOLDERS };
