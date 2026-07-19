import type { TemplateFile } from "../../../shared.js";
import { billingPage, billingPageContent, type RouterType } from "./page.js";

export { billingPage, billingPageContent, type RouterType };

export function billingFiles(router: RouterType = "next"): TemplateFile[] {
  return [billingPage(router)];
}
