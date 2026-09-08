import { uiUtilsContent } from "../../../ui/utils.js";
import { file, type TemplateFile } from "../../../shared.js";
import { primitivesFiles } from "./primitives.js";
import { feedbackFiles } from "./feedback.js";
import { formsFiles } from "./forms.js";
import { layoutFiles } from "./layout.js";
import { overlaysFiles, sheetFiles } from "./overlays.js";
import { dropdownFiles } from "./dropdown.js";
import { chartFiles } from "./data.js";
import { formFieldsFiles } from "./form-fields.js";
import { dialogsFiles } from "./dialogs.js";
import { missingUiFiles } from "./missing.js";
import { chatFiles } from "./chat.js";

/**
 * The same shadcn-style component set, emitted for a single-mode (flat) project.
 *
 * Single-mode pages import `@/components/ui/*` exactly like the monorepo app, but
 * nothing emitted them, so every single-mode project failed to typecheck with
 * TS2307. `src/lib/utils.ts` is already emitted by the single composer, so it is
 * filtered out here to avoid a duplicate path.
 */
export function singleWebUiFiles(): TemplateFile[] {
  return webUiFiles()
    .filter((f) => f.path !== "apps/web/src/lib/utils.ts")
    .map((f) => ({ ...f, path: f.path.replace(/^apps\/web\/src\//, "src/") }));
}

export function webUiFiles(): TemplateFile[] {
  const cnFile = file("apps/web/src/lib/utils.ts", uiUtilsContent());
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
    ...formFieldsFiles(),
    ...dialogsFiles(),
    ...missingUiFiles(),
    ...chatFiles(),
  ];
}
