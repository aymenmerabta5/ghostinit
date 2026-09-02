import type { TemplateFile } from "../../../shared.js";
import {
  adminCreateUserFormFile,
  adminCreateUserPage,
  nextAdminCreateUserPage,
} from "./create-user-page.js";
import { adminDashboardFile, adminDashboardPage } from "./dashboard.js";
import { adminDataFiles } from "./feature-data.js";
import { adminSchemaFiles } from "./feature-schema.js";
import { adminFiltersFile } from "./filters.js";
import { adminUsersHook, useAdminUsersHook } from "./hooks.js";
import { adminLayout, adminLayoutFile } from "./layout.js";
import type { AdminTemplateOptions } from "./model.js";
import {
  tanstackAdminCreateUserContent,
  tanstackAdminDashboardContent,
  tanstackAdminRouteFiles,
  tanstackAdminUsersContent,
} from "./tanstack-routes.js";
import { adminUserRow, adminUserRowConfirmationFile, adminUserRowFile } from "./user-row.js";
import { adminUserTableFile } from "./user-table.js";
import { adminTranslationsFile } from "./translations.js";
import {
  adminFeatureIndexFile,
  adminUserResultsFile,
  adminUsersPage,
  nextAdminUsersPage,
} from "./users-page.js";

export type { AdminDatabase, AdminFramework, AdminMode, AdminTemplateOptions } from "./model.js";

export function adminFeatureFiles(options: AdminTemplateOptions): TemplateFile[] {
  return [
    adminTranslationsFile(options),
    ...adminSchemaFiles(options),
    ...adminDataFiles(options),
    adminUsersHook(options),
    adminFiltersFile(options),
    adminUserTableFile(options),
    adminUserRowFile(options),
    adminUserRowConfirmationFile(options),
    adminCreateUserFormFile(options),
    adminUserResultsFile(options),
    adminFeatureIndexFile(options),
  ];
}

export function nextAdminFiles(options: AdminTemplateOptions): TemplateFile[] {
  return [
    ...adminFeatureFiles(options),
    adminLayoutFile(options),
    adminDashboardFile(options),
    nextAdminUsersPage(options),
    nextAdminCreateUserPage(options),
  ];
}

export function adminFiles(isConvex = false, i18n = false): TemplateFile[] {
  return nextAdminFiles({
    database: isConvex ? "convex" : "postgres",
    framework: "next",
    i18n,
    mode: "monorepo",
    sourceRoot: "apps/web/src",
  });
}

export function tanstackAdminFiles(isConvex = false, i18n = false): TemplateFile[] {
  const options: AdminTemplateOptions = {
    database: isConvex ? "convex" : "postgres",
    framework: "tanstack",
    i18n,
    mode: "monorepo",
    sourceRoot: "apps/web/src",
  };
  return [...adminFeatureFiles(options), ...tanstackAdminRouteFiles(options)];
}

export {
  adminCreateUserPage,
  adminDashboardPage,
  adminLayout,
  adminUserRow,
  adminUsersPage,
  tanstackAdminCreateUserContent,
  tanstackAdminDashboardContent,
  tanstackAdminUsersContent,
  useAdminUsersHook,
};
