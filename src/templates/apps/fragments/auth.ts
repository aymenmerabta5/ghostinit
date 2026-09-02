/**
 * Auth fragments shim — split 577 LOC god file into auth/ folder <300 LOC each.
 */
export { sharedValidators } from "./auth/validators.js";
export { authOAuthButtonsContent } from "./auth/controls.js";
export { signInFormContent, signInFormFields, signInPageContent } from "./auth/sign-in.js";
export { signInMethodsContent } from "./auth/sign-in-methods.js";
export { signUpFormContent, signUpPageContent } from "./auth/sign-up.js";
export { twoFactorPageContent } from "./auth/two-factor.js";
export {
  routerImports,
  authClientImport,
  authClientImportTanstack,
  sharedAuthImports,
  type RouterType,
} from "./auth/imports.js";
export {
  signInNavigateLogic,
  signUpNavigateLogic,
  authBackLink,
  linkTo,
} from "./auth/navigation.js";
