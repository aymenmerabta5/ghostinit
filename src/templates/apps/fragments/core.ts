/**
 * Core fragments shim — split 391 LOC file into core/ folder (<150 each).
 * Keeps backwards-compatible import path "./fragments/core.js".
 */
export {
  securityHeaders,
  cacheComponentsConfigBlock,
  nextConfigHeadersFunction,
  transpilePackagesList,
  posthogRewritesBlock,
  tanstackSecurityPolicyDeclaration,
  viteSecurityHeaders,
} from "./core/security.js";
export { postcssConfigContent } from "./core/config.js";
export { orpcClientContent, authClientShim } from "./core/orpc.js";
export {
  useCopyHookContent,
  useBillingHookContent,
  useAuthHookContent,
  tanstackUseCopyHookContent,
  tanstackUseBillingHookContent,
  tanstackUseAuthHookContent,
} from "./core/hooks.js";
