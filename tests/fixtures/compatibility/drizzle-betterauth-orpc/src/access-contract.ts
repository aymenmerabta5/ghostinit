import { adminClient } from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { admin } from "better-auth/plugins/admin";
import { defaultStatements } from "better-auth/plugins/admin/access";
import {
  compiledAdminUserPermissions,
  compiledSessionPermissions,
  compiledSuperAdminUserPermissions,
} from "./access-permissions.js";

export {
  compiledAdminUserPermissions,
  compiledSessionPermissions,
  compiledSuperAdminUserPermissions,
} from "./access-permissions.js";

export const ac = createAccessControl(defaultStatements);
export const roles = {
  admin: ac.newRole({
    user: compiledAdminUserPermissions,
    session: compiledSessionPermissions,
  }),
  superAdmin: ac.newRole({
    user: compiledSuperAdminUserPermissions,
    session: compiledSessionPermissions,
  }),
  user: ac.newRole({ user: [], session: [] }),
  viewer: ac.newRole({ user: ["list"], session: ["list"] }),
} as const;

export const serverAdminPlugin = admin({
  ac,
  roles,
  adminRoles: ["admin", "superAdmin"],
});
export const clientAdminPlugin = adminClient({ ac, roles });
export type CompiledRole = keyof typeof roles;
export const compiledAdminRoles = ["admin", "superAdmin"] satisfies readonly CompiledRole[];
