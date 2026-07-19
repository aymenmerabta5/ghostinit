import type { TemplateFile } from "../../shared.js";
import { apiPackage } from "../../api.js";

export function apiComposerFiles(): TemplateFile[] {
  return apiPackage();
}
