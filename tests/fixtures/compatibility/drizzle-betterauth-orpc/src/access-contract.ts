import { adminClient } from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { admin } from "better-auth/plugins/admin";
import { defaultStatements } from "better-auth/plugins/admin/access";

const ac = createAccessControl(defaultStatements);
const roles = {
  admin: ac.newRole({
    user: ["create", "list", "set-role", "ban", "delete"],
    session: ["list", "revoke"],
  }),
  superAdmin: ac.newRole({
    user: [...defaultStatements.user],
    session: [...defaultStatements.session],
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
