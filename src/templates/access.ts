import { file, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";

export const SUPER_ADMIN_USER_PERMISSIONS = [
  "create",
  "list",
  "set-role",
  "ban",
  "impersonate",
  "impersonate-admins",
  "delete",
  "set-password",
  "set-email",
  "get",
  "update",
] as const;
export const ADMIN_USER_PERMISSIONS = [
  "create",
  "list",
  "set-role",
  "ban",
  "impersonate",
  "delete",
  "set-password",
  "set-email",
  "get",
  "update",
] as const;
export const SESSION_PERMISSIONS = ["list", "revoke", "delete"] as const;

function renderPermissions(permissions: readonly string[]): string {
  return JSON.stringify(permissions, null, 2).replaceAll("\n", "\n  ");
}

function monorepoAccessContent(): string {
  return `import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

export const superAdmin = ac.newRole({
  user: ${renderPermissions(SUPER_ADMIN_USER_PERMISSIONS)},
  session: ${renderPermissions(SESSION_PERMISSIONS)},
});
export const adminRole = ac.newRole({
  user: ${renderPermissions(ADMIN_USER_PERMISSIONS)},
  session: ${renderPermissions(SESSION_PERMISSIONS)},
});
export const user = ac.newRole({ user: [], session: [] });
export const viewer = ac.newRole({ user: ["list"], session: ["list"] });

export const roles = {
  superAdmin,
  admin: adminRole,
  user,
  viewer,
} as const;
export type AccessRole = keyof typeof roles;
export const ADMIN_ROLE_NAMES = ["admin", "superAdmin"] as const;
export type AdminRole = (typeof ADMIN_ROLE_NAMES)[number];
export function isAdminRole(role: unknown): role is AdminRole {
  return role === "admin" || role === "superAdmin";
}
`;
}

function singleAccessContent(): string {
  return `export type SingleRole = "admin" | "user";
export function isSingleAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}
`;
}

export function accessFiles(mode: ProjectMode = "monorepo"): TemplateFile[] {
  if (mode === "single") {
    return [file("src/lib/access.ts", singleAccessContent())];
  }
  return [file("packages/auth/src/access.ts", monorepoAccessContent())];
}
