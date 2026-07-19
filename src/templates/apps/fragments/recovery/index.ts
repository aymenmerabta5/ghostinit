import type { TemplateFile } from "../../../shared.js";
import { forgotPasswordPage, forgotPasswordPageContent } from "./forgot-password.js";
import { resetPasswordPage, resetPasswordPageContent } from "./reset-password.js";

export type RouterType = "next" | "tanstack";
export {
  forgotPasswordPage,
  resetPasswordPage,
  forgotPasswordPageContent,
  resetPasswordPageContent,
  type RouterType as RecoveryRouterType,
};

export function recoveryFiles(router: RouterType = "next"): TemplateFile[] {
  return [forgotPasswordPage(router), resetPasswordPage(router)];
}
