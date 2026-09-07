import {
  forgotPasswordPageContent,
  resetPasswordPageContent,
  resetPasswordFormContent,
} from "../../../apps/fragments/recovery/index.js";

export function forgotPasswordPageSingle(): string {
  return forgotPasswordPageContent("next");
}

export function resetPasswordPageSingle(): string {
  return resetPasswordPageContent("next");
}

export function resetPasswordFormSingleContent(): string {
  return resetPasswordFormContent("next");
}
