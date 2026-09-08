import type { TemplateFile } from "../../../shared.js";
import { forgotPasswordPage, forgotPasswordPageContent } from "./forgot-password.js";
import { resetPasswordPage, resetPasswordPageContent } from "./reset-password.js";
import { resetPasswordForm, resetPasswordFormContent } from "./reset-password-form.js";
import { emailFlowFiles, emailFlowPageContent } from "./email-flows.js";

export type RouterType = "next" | "tanstack";
export {
  forgotPasswordPage,
  resetPasswordPage,
  forgotPasswordPageContent,
  resetPasswordPageContent,
  resetPasswordForm,
  resetPasswordFormContent,
  emailFlowFiles,
  emailFlowPageContent,
  type RouterType as RecoveryRouterType,
};

export function recoveryFiles(router: RouterType = "next", hasEmail = true): TemplateFile[] {
  return hasEmail
    ? [
        forgotPasswordPage(router),
        resetPasswordPage(router),
        resetPasswordForm(router),
        ...emailFlowFiles(router),
      ]
    : [];
}
