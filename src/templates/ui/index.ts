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
export { componentRegistry, componentRegistryContent } from "./component-registry.js";
export { componentsJsonContent, componentsJsonData } from "./components-json.js";
export {
  buildDesignSystemContract,
  designSystemContractJsonContent,
  designSystemContractModuleContent,
} from "./contract.js";
export {
  designSystemFiles,
  designSystemTemplateFiles,
  selectedUiAdapters,
} from "./design-system.js";
export {
  normalizeDesignSystemApps,
  resolveDesignSystemApps,
  resolveUiLayout,
  uiAdapterIds,
} from "./layout.js";
export type { ResolvedDesignSystemApp, ResolvedUiLayout, UiAdapterId } from "./layout.js";
export { designSystemExports } from "./manifest.js";
export {
  applyDesignSystemApplications,
  integrateDesignSystemApplications,
} from "./app-integration.js";
export {
  baseContractCssContent,
  designStyleSources,
  nativeBaseTsContent,
  utilitiesCssContent,
  webBaseCssContent,
} from "./styles.js";
