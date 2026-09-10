import { file, type TemplateFile } from "../../../shared.js";
import { adminFeatureRoot, type AdminTemplateOptions } from "./model.js";

function hookContent(): string {
  return `"use client";

import * as React from "react";
import { useAdminUserMutations } from "./mutations";
import { useAdminUsersData, resolveAdminUsersError } from "./queries";
import { translateAdminUsersError } from "./translations";
import { useAdminUsersTranslations } from "./use-admin-users-translations";
import { DEFAULT_ADMIN_USERS_FILTERS } from "./types";
import type {
  AdminUsersFilterInput,
  AdminUsersFilters,
  AdminUsersInitialData,
  AdminUserRole,
} from "./types";

export function useAdminUsers(initialData?: AdminUsersInitialData) {
  const translate = useAdminUsersTranslations();
  const [filters, setFilters] = React.useState<AdminUsersFilters>(DEFAULT_ADMIN_USERS_FILTERS);
  const isDefaultRequest = filters.search.length === 0 && filters.page === 1;
  const query = useAdminUsersData(filters, isDefaultRequest ? initialData : undefined);
  const mutations = useAdminUserMutations();
  const totalPages = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / filters.limit),
    query.hasMore ? filters.page + 1 : filters.page,
  );

  const applyFilters = React.useCallback((input: AdminUsersFilterInput): void => {
    setFilters((current) => ({ ...current, search: input.search.trim(), page: 1 }));
  }, []);

  const goToPage = React.useCallback(
    (page: number): void => {
      const nextPage = Math.max(1, page);
      query.requestPage?.(nextPage);
      setFilters((current) => ({ ...current, page: nextPage }));
    },
    [query],
  );

  return {
    users: query.data?.users ?? [],
    total: query.data?.total,
    filters,
    totalPages,
    isPending: query.isPending,
    isFetching: query.isFetching,
    queryError: translateAdminUsersError(resolveAdminUsersError(query.error), translate),
    mutationError: translateAdminUsersError(resolveAdminUsersError(mutations.error), translate),
    hasMore: query.hasMore,
    totalIsExact: query.totalIsExact,
    applyFilters,
    clearFilters: () => applyFilters({ search: "" }),
    previousPage: () => goToPage(filters.page - 1),
    nextPage: () => goToPage(filters.page + 1),
    retry: query.retry,
    resetMutationError: mutations.resetErrors,
    async toggleRole(identityId: string, currentRole: AdminUserRole): Promise<boolean> {
      return await mutations.updateRole(identityId, currentRole === "admin" ? "user" : "admin");
    },
    async toggleBanned(identityId: string, currentlyBanned: boolean): Promise<boolean> {
      return await mutations.updateBanned(identityId, !currentlyBanned);
    },
    rolePendingId: mutations.rolePendingId,
    banPendingId: mutations.banPendingId,
  };
}
`;
}

export function adminUsersHook(options: AdminTemplateOptions): TemplateFile {
  return file(`${adminFeatureRoot(options)}/use-admin-users.ts`, hookContent());
}
