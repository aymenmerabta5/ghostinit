import type { TemplateFile } from "../../shared.js";
import { uiPackage } from "../../ui.js";

export function uiComposerFiles(): TemplateFile[] {
  return uiPackage();
}
