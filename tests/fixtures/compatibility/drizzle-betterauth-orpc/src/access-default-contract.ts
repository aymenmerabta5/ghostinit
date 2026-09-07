import { adminClient } from "better-auth/client/plugins";
import { admin } from "better-auth/plugins/admin";

export const singleServerAdmin = admin();
export const singleClientAdmin = adminClient();
export type SingleRole = "admin" | "user";
export const singleRoleNames = ["admin", "user"] satisfies readonly SingleRole[];
export function isSingleAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}
