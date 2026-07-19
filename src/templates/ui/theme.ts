import { file, type TemplateFile } from "../shared.js";

export function themeFiles(): TemplateFile[] {
  return [
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
