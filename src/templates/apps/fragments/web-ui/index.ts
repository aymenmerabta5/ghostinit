import { file, type TemplateFile } from "../../../shared.js";
import { primitivesFiles } from "./primitives.js";
import { feedbackFiles } from "./feedback.js";
import { formsFiles } from "./forms.js";
import { layoutFiles } from "./layout.js";
import { overlaysFiles, sheetFiles } from "./overlays.js";
import { dropdownFiles } from "./dropdown.js";
import { chartFiles } from "./data.js";

export function webUiFiles(): TemplateFile[] {
  const cnFile = file(
    "apps/web/src/lib/utils.ts",
    `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`,
  );
  return [
    cnFile,
    ...primitivesFiles(),
    ...feedbackFiles(),
    ...formsFiles(),
    ...layoutFiles(),
    ...overlaysFiles(),
    ...sheetFiles(),
    ...dropdownFiles(),
    ...chartFiles(),
  ];
}
