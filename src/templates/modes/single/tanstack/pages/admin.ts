import type { TemplateFile } from "../../../../shared.js";
import { adminFeatureFiles } from "../../../../apps/fragments/admin/index.js";
import { tanstackAdminRouteFiles } from "../../../../apps/fragments/admin/tanstack-routes.js";

export function singleTanstackAdminFeatureFiles(isConvex = false, i18n = false): TemplateFile[] {
  const options = {
    database: isConvex ? "convex" : "postgres",
    framework: "tanstack",
    i18n,
    mode: "single",
    sourceRoot: "src",
  } as const;
  return [...adminFeatureFiles(options), ...tanstackAdminRouteFiles(options)];
}
