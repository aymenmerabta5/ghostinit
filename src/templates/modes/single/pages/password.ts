import {
  forgotPasswordPageContent,
  resetPasswordPageContent,
} from "../../../apps/fragments/recovery/index.js";

export function forgotPasswordPageSingle(): string {
  return forgotPasswordPageContent("next");
}

export function resetPasswordPageSingle(): string {
  return resetPasswordPageContent("next");
}
