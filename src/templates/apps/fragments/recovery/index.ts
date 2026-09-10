import type { TemplateFile } from "../../../shared.js";
import {
  forgotPasswordPage,
  forgotPasswordPageContent,
  forgotPasswordViewContent,
} from "./forgot-password.js";
import { resetPasswordPage, resetPasswordPageContent } from "./reset-password.js";
import { resetPasswordForm, resetPasswordFormContent } from "./reset-password-form.js";
import { emailFlowFiles, emailFlowPageContent, emailFlowViewContent } from "./email-flows.js";

export type RouterType = "next" | "tanstack";
export {
  forgotPasswordPage,
  resetPasswordPage,
  forgotPasswordPageContent,
  forgotPasswordViewContent,
  resetPasswordPageContent,
  resetPasswordForm,
  resetPasswordFormContent,
  emailFlowFiles,
  emailFlowPageContent,
  emailFlowViewContent,
  type RouterType as RecoveryRouterType,
};

export function recoveryFiles(router: RouterType = "next", hasEmail = true): TemplateFile[] {
  return hasEmail
    ? [forgotPasswordPage(router), resetPasswordPage(router), ...emailFlowFiles(router)]
    : [];
}
