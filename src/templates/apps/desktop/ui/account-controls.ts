import { missingUiFiles } from "../../fragments/web-ui/missing.js";
import { file, type TemplateFile } from "../../../shared.js";
import { layoutFiles } from "../../fragments/web-ui/layout.js";
import { fieldFiles } from "../../fragments/web-ui/field.js";

/** Desktop uses the same reviewed DOM primitives as its shared account views. */
export function desktopAccountControlFiles(
  sourceRoot: string,
  translationImport: string,
): TemplateFile[] {
  const primitives = [...layoutFiles(), ...fieldFiles(), ...missingUiFiles()];
  const utilitiesImport = sourceRoot.startsWith("apps/")
    ? "@repo/ui/lib/utils"
    : "@/platform/ui/lib/utils";
  return ["dialog", "toggle-group", "checkbox"].map((name) => {
    const template = primitives.find((entry) => entry.path.endsWith(`/ui/${name}.tsx`));
    if (!template) throw new Error(`Missing shared account primitive: ${name}`);
    return file(
      `${sourceRoot}/components/ui/${name}.tsx`,
      template.content
        .replace('"../../lib/translations"', JSON.stringify(translationImport))
        .replace('"../../lib/utils"', JSON.stringify(utilitiesImport)),
    );
  });
}
