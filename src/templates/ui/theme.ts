import { uiUtilsContent } from "./utils.js";
import { semanticThemeCssContent } from "../apps/fragments/css.js";
import { file, type TemplateFile } from "../shared.js";

export function themeCssContent(): string {
  return semanticThemeCssContent();
}

export function themeFiles(): TemplateFile[] {
  return [
    file("packages/ui/src/theme.css", themeCssContent()),
    file("packages/ui/src/lib/utils.ts", uiUtilsContent()),
  ];
}
