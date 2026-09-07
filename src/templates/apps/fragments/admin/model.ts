export type AdminDatabase = "postgres" | "convex";
export type AdminFramework = "next" | "tanstack";
export type AdminMode = "monorepo" | "single";

export interface AdminTemplateOptions {
  database: AdminDatabase;
  framework: AdminFramework;
  i18n?: boolean;
  mode: AdminMode;
  sourceRoot: "apps/web/src" | "src";
}

export function adminFeatureRoot(options: AdminTemplateOptions): string {
  return `${options.sourceRoot}/features/admin-users`;
}
