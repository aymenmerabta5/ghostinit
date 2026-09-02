import type { TemplateFile } from "../../../shared.js";
import { nextAdminFiles } from "../../../apps/fragments/admin/index.js";

export function singleNextAdminFeatureFiles(isConvex = false, i18n = false): TemplateFile[] {
  return nextAdminFiles({
    database: isConvex ? "convex" : "postgres",
    framework: "next",
    i18n,
    mode: "single",
    sourceRoot: "src",
  });
}
