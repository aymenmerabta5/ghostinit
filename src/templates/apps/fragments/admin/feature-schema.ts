import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

export function adminSchemaFiles(options: AdminTemplateOptions): TemplateFile[] {
  const root = adminFeatureRoot(options);
  return [
    file(
      `${root}/schema.ts`,
      `import { z } from "zod";
import type { AdminUsersTranslate } from "./translations";

export const adminUserRoleSchema = z.enum(["user", "admin"]);

export function adminUsersFilterSchema(translate: AdminUsersTranslate) {
  return z.object({
    search: z.string().trim().max(120, translate("validation.searchTooLong")),
  });
}

export function createAdminUserSchema(translate: AdminUsersTranslate) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, translate("validation.nameRequired"))
      .max(80, translate("validation.nameTooLong")),
    email: z.string().trim().email(translate("validation.emailInvalid")),
    password: z
      .string()
      .min(8, translate("validation.passwordTooShort"))
      .max(128, translate("validation.passwordTooLong")),
    role: adminUserRoleSchema,
  });
}

export type AdminUserRole = z.infer<typeof adminUserRoleSchema>;
export type AdminUsersFilterInput = z.infer<ReturnType<typeof adminUsersFilterSchema>>;
export type CreateAdminUserInput = z.infer<ReturnType<typeof createAdminUserSchema>>;
`,
    ),
    file(
      `${root}/types.ts`,
      `import type { AdminUserRole, AdminUsersFilterInput, CreateAdminUserInput } from "./schema";

export interface AdminUser {
  id: string;
  identityId: string | null;
  name: string | null;
  email: string;
  role: AdminUserRole;
  banned: boolean;
}

export interface AdminUsersFilters {
  search: string;
  page: number;
  limit: number;
}

export const DEFAULT_ADMIN_USERS_FILTERS: AdminUsersFilters = {
  search: "",
  page: 1,
  limit: 20,
};

export interface AdminUsersResult {
  users: AdminUser[];
  total: number;
}

export interface AdminUsersQueryState {
  data: AdminUsersResult | undefined;
  error: unknown;
  isFetching: boolean;
  isPending: boolean;
  hasMore: boolean;
  totalIsExact: boolean;
  requestPage?: (page: number) => void;
  retry?: () => Promise<void>;
}

export type AdminUsersInitialData = AdminUsersResult;

export type { AdminUserRole, AdminUsersFilterInput, CreateAdminUserInput };
`,
    ),
  ];
}
