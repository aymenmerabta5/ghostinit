import {
  authOAuthButtonsContent,
  signInFormContent,
  signInMethodsContent,
  signInPageContent,
  signUpFormContent,
  signUpPageContent,
  twoFactorPageContent,
} from "../../../../apps/fragments/auth/index.js";
import {
  forgotPasswordPageContent,
  resetPasswordPageContent,
} from "../../../../apps/fragments/recovery/index.js";

export function singleSignInRouteTanstackContent(hasEmail = true): string {
  return signInPageContent("tanstack", hasEmail);
}

export function singleSignUpRouteTanstackContent(): string {
  return signUpPageContent("tanstack");
}

export function singleAuthOAuthButtonsTanstackContent(): string {
  return authOAuthButtonsContent();
}

export function singleSignInFormTanstackContent(hasEmail = true, hasPasskey = true): string {
  return signInFormContent("tanstack", hasEmail, hasPasskey);
}

export function singleSignInMethodsTanstackContent(hasPasskey = true): string {
  return signInMethodsContent("tanstack", hasPasskey);
}

export function singleSignUpFormTanstackContent(hasEmail = true): string {
  return signUpFormContent("tanstack", hasEmail);
}

export function singleForgotPasswordRouteTanstackContent(): string {
  return forgotPasswordPageContent("tanstack");
}

export function singleResetPasswordRouteTanstackContent(): string {
  return resetPasswordPageContent("tanstack");
}

export function singleTwoFactorRouteTanstackContent(): string {
  return twoFactorPageContent("tanstack");
}
