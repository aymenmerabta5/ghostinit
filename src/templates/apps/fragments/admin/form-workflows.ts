import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

export function adminFormWorkflowFiles(options: AdminTemplateOptions): TemplateFile[] {
  const root = adminFeatureRoot(options);
  return [
    file(
      `${root}/use-create-admin-user.ts`,
      `"use client";
import { useAppForm } from "@/components/ui/form";
import { useAdminUserMutations } from "./mutations";
import { resolveAdminUsersError } from "./queries";
import { createAdminUserSchema } from "./schema";
import { translateAdminUsersError } from "./translations";
import { useAdminUsersTranslations } from "./use-admin-users-translations";
import type { CreateAdminUserInput } from "./types";

export function useCreateAdminUser(onCreated: () => void) {
  const translate = useAdminUsersTranslations();
  const mutations = useAdminUserMutations();
  const defaultValues: CreateAdminUserInput = { name: "", email: "", password: "", role: "user" };
  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: createAdminUserSchema(translate) },
    onSubmit: async ({ value }) => {
      const created = await mutations.createUser(value);
      if (created) { form.reset(); onCreated(); }
    },
  });
  return { form, translate, pending: mutations.createPending, error: translateAdminUsersError(resolveAdminUsersError(mutations.error), translate, "errors.createFailed") };
}
`,
    ),
    file(
      `${root}/use-admin-user-filters.ts`,
      `"use client";
import { useAppForm } from "@/components/ui/form";
import { adminUsersFilterSchema } from "./schema";
import { useAdminUsersTranslations } from "./use-admin-users-translations";
import type { AdminUsersFilterInput } from "./types";

export interface AdminUserFilterOptions {
  search: string;
  isFetching: boolean;
  onApply(input: AdminUsersFilterInput): void;
  onClear(): void;
}
export function useAdminUserFilters({ search, isFetching, onApply, onClear }: AdminUserFilterOptions) {
  const translate = useAdminUsersTranslations();
  const form = useAppForm({
    defaultValues: { search },
    validators: { onSubmit: adminUsersFilterSchema(translate) },
    onSubmit: ({ value }) => onApply(value),
  });
  function clear(): void { form.setFieldValue("search", ""); onClear(); }
  return { form, translate, search, isFetching, clear };
}
`,
    ),
    file(
      `${root}/use-admin-user-action.ts`,
      `"use client";
import { useState } from "react";
import type { AdminUser, AdminUserRole } from "./types";
export type UserRowConfirmation = "role" | "ban" | null;
export interface AdminUserActionOptions {
  user: AdminUser;
  rolePending: boolean;
  banPending: boolean;
  onToggleRole(identityId: string, currentRole: AdminUserRole): Promise<boolean>;
  onToggleBanned(identityId: string, currentlyBanned: boolean): Promise<boolean>;
}
export function useAdminUserAction(options: AdminUserActionOptions) {
  const { user, rolePending, banPending, onToggleRole, onToggleBanned } = options;
  const [confirmation, setConfirmation] = useState<UserRowConfirmation>(null);
  const canManage = user.identityId !== null;
  const pending = confirmation === "role" ? rolePending : banPending;
  async function confirmAction(): Promise<void> {
    if (!user.identityId || !confirmation) return;
    const succeeded = confirmation === "role"
      ? await onToggleRole(user.identityId, user.role)
      : await onToggleBanned(user.identityId, user.banned);
    if (succeeded) setConfirmation(null);
  }
  return { confirmation, canManage, pending, confirmAction, chooseRole: () => setConfirmation("role"), chooseBan: () => setConfirmation("ban"), cancel: () => setConfirmation(null) };
}
`,
    ),
  ];
}
