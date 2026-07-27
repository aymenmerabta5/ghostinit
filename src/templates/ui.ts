// @allow-long 9: ghostinit's primitives/forms/overlays/layout/feedback/dropdown/data UI components
// live at src/templates/apps/fragments/web-ui/. This folder is ONLY the minimal
// @repo/ui tokens package — theme.css + cn util + package.json. Nothing else.
// See src/templates/apps/fragments/web-ui/index.ts for the actual UI barrel.
/**
 * Compat shim — original god file split into src/templates/ui/ modular folder.
 * See top-level note about tokens-only vs components split.
 */

export { uiPackage } from "./ui/index.js";

// Explicit named re-exports — no `export *` (tree-shaking safety convention).
export {
  uiPackage as uiFiles,
  uiPackage as uiTemplateFiles,
  configFiles,
  barrelFile,
  themeCssContent,
  themeFiles,
} from "./ui/index.js";

// Orphan guard: every file in this folder must be referenced by index.ts.
// The 7 component files that used to live here (primitives/forms/overlays/layout/
// feedback/dropdown/data) duplicated apps/fragments/web-ui/* and produced no output —
// they were deleted. If a new orphan appears, it will still surface via the
// host's `no-unused-vars` and the composition-conflicts guard (those emitters
// would need to produce an output file again for the conflict to reappear).
