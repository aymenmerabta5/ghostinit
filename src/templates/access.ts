import { file, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";

function monorepoAccessContent(): string {
  return `import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl(defaultStatements);

export const superAdmin = ac.newRole({
  user: [
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
  ],
  session: ["list", "revoke", "delete"],
});
export const adminRole = ac.newRole({
  user: [
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
  ],
  session: ["list", "revoke", "delete"],
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
