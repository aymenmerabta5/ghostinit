export const compiledSuperAdminUserPermissions = [
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

export const compiledAdminUserPermissions = [
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

export const compiledSessionPermissions = ["list", "revoke", "delete"] as const;
