import { semanticThemeCssContent } from "../apps/fragments/css.js";
import { file, type TemplateFile } from "../shared.js";

export function themeCssContent(): string {
  return semanticThemeCssContent();
}

export function themeFiles(): TemplateFile[] {
  return [
    file("packages/ui/src/theme.css", themeCssContent()),
    file(
      "packages/ui/src/lib/utils.ts",
      `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`,
    ),
  ];
}
