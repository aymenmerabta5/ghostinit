import { admin } from "better-auth/plugins/admin";
import type { BetterAuthOptions } from "better-auth/minimal";
import { ac, roles } from "./access-contract.js";

export const monorepoConvexOptions = {
  plugins: [admin({ ac, roles, adminRoles: ["admin", "superAdmin"] })],
} satisfies BetterAuthOptions;

export const singleConvexOptions = {
  plugins: [admin()],
} satisfies BetterAuthOptions;
