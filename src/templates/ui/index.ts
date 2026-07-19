import { mergeFiles, type TemplateFile } from "../shared.js";
import * as f from "./all.js";

export function uiPackage(): TemplateFile[] {
  return mergeFiles(
    f.configFiles(),
    f.themeFiles(),
    f.primitivesFiles(),
    f.feedbackFiles(),
    f.formsFiles(),
    f.layoutFiles(),
    f.overlaysFiles(),
    f.dropdownFiles(),
    f.sheetFiles(),
    f.chartFiles(),
    [f.barrelFile()],
  );
}

export const uiFiles = uiPackage;
export const uiTemplateFiles = uiPackage;
export default uiPackage;
