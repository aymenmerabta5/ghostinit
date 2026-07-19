/**
 * i18n shim — re-exports from i18n/ folder to keep <300 LOC per file.
 * Original 1244 LOC god file split into messages/*, resolver, next/*, tanstack/*, index.
 */
export {
  i18nFiles,
  resolveI18nParams,
  EN_MESSAGES,
  FR_MESSAGES,
  AR_MESSAGES,
} from "./i18n/index.js";
export { nextRoutingFile } from "./i18n/next/routing.js";
export { nextRequestFile } from "./i18n/next/request.js";
export { nextNavigationFile } from "./i18n/next/navigation.js";
export { nextI18nConfigFile } from "./i18n/next/config.js";
export { nextMiddlewareFile } from "./i18n/next/middleware.js";
export { nextLocaleSwitcherComponent } from "./i18n/next/switcher.js";
export { tanstackConfigFile } from "./i18n/tanstack/config.js";
export { tanstackLibFile } from "./i18n/tanstack/lib.js";
export { tanstackLocaleSwitcherFile } from "./i18n/tanstack/switcher.js";
