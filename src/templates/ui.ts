// GhostInit's primitives/forms/overlays/layout/feedback components live at
// src/templates/apps/fragments/web-ui/. This module owns the mode-resolved,
// machine-defined design contract, registry, styles and package surface.
export { uiPackage } from "./ui/index.js";

export {
  uiPackage as uiFiles,
  uiPackage as uiTemplateFiles,
  configFiles,
  barrelFile,
  themeCssContent,
  themeFiles,
  componentRegistry,
  componentRegistryContent,
  componentsJsonContent,
  componentsJsonData,
  buildDesignSystemContract,
  designSystemContractJsonContent,
  designSystemContractModuleContent,
  designSystemFiles,
  designSystemTemplateFiles,
  selectedUiAdapters,
  normalizeDesignSystemApps,
  resolveDesignSystemApps,
  resolveUiLayout,
  uiAdapterIds,
  designSystemExports,
  applyDesignSystemApplications,
  integrateDesignSystemApplications,
  baseContractCssContent,
  designStyleSources,
  nativeBaseTsContent,
  utilitiesCssContent,
  webBaseCssContent,
} from "./ui/index.js";

export type { ResolvedDesignSystemApp, ResolvedUiLayout, UiAdapterId } from "./ui/index.js";

// Orphan guard: every file in this folder must be referenced by index.ts.
// The 7 component files that used to live here (primitives/forms/overlays/layout/
// feedback/dropdown/data) duplicated apps/fragments/web-ui/* and produced no output —
// they were deleted. If a new orphan appears, it will still surface via the
// host's `no-unused-vars` and the composition-conflicts guard (those emitters
// would need to produce an output file again for the conflict to reappear).
