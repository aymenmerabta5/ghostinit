export { billingEnvLines, billingEnvLocalLines, billingEnvLocalLinesFiltered } from "./billing.js";
export {
  coreEnvExampleLines,
  coreEnvLocalLines,
  resendExampleLines,
  resendLocalLines,
} from "./core.js";
export {
  envExampleContent,
  envPlaceholderContent,
  envLocalContent,
  filteredEnvExample,
  filteredEnvLocal,
} from "./builders.js";
export const Placeholders: Record<string, string> = {
  BETTER_AUTH_SECRET: "REPLACE_WITH_BETTER_AUTH_SECRET",
};
import { ENV_PLACEHOLDERS } from "../../../lib/constants.js";
export { ENV_PLACEHOLDERS };
export const PlaceholdersCompat = ENV_PLACEHOLDERS;
