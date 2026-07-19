import type { TemplateFile } from "../../../shared.js";
import { adminLayout } from "./layout.js";
import { adminDashboardPage } from "./dashboard.js";
import { useAdminUsersHook } from "./hooks.js";
import { adminUserRow } from "./user-row.js";
import { adminUsersPage } from "./users-page.js";
import { adminCreateUserPage } from "./create-user-page.js";

export {
  adminLayout,
  adminDashboardPage,
  useAdminUsersHook,
  adminUserRow,
  adminUsersPage,
  adminCreateUserPage,
};

export function adminFiles(): TemplateFile[] {
  return [
    adminLayout(),
    adminDashboardPage(),
    useAdminUsersHook(),
    adminUserRow(),
    adminUsersPage(),
    adminCreateUserPage(),
  ];
}
