import {
  authOAuthButtonsContent,
  signInFormContent,
  signInMethodsContent,
  signInPageContent,
  signUpFormContent,
  signUpPageContent,
} from "../../../apps/fragments/auth/index.js";

export { forgotPasswordPageSingle, resetPasswordPageSingle } from "./password.js";

export function signInPageSingle(hasEmail = true): string {
  return signInPageContent("next", hasEmail);
}

export function signUpPageSingle(): string {
  return signUpPageContent("next");
}

export function authOAuthButtonsSingleContent(): string {
  return authOAuthButtonsContent();
}

export function signInFormSingleContent(hasEmail = true, hasPasskey = true): string {
  return signInFormContent("next", hasEmail, hasPasskey);
}

export function signInMethodsSingleContent(hasPasskey = true): string {
  return signInMethodsContent("next", hasPasskey);
}

export function signUpFormSingleContent(hasEmail = true): string {
  return signUpFormContent("next", hasEmail);
}
