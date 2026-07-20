import { mergeFiles, type TemplateFile } from "../shared.js";
import { configFiles, barrelFile } from "./config.js";
import { themeFiles } from "./theme.js";

export function uiPackage(): TemplateFile[] {
  return mergeFiles(configFiles(), themeFiles(), [barrelFile()]);
}

export const uiFiles = uiPackage;
export const uiTemplateFiles = uiPackage;
export default uiPackage;

export { themeCssContent, themeFiles } from "./theme.js";
export { configFiles, barrelFile } from "./config.js";
