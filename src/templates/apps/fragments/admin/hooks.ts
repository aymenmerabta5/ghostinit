import { file, type TemplateFile } from "../../../shared.js";
export function useAdminUsersHook(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/hooks/use-admin-users.ts",
    `"use client";
import { useEffect, useState, useCallback } from "react";
import { authClient } from "../../../../lib/auth-client.js";
import { isUserRole } from "@repo/kernel";
import type { AdminUser, UserRole, UseAdminUsersReturn } from "@repo/kernel";
interface AdminUsersViewState {
  search: string;
  setSearch: (search: string) => void;
  page: number;
  setPage: (page: number) => void;
  limit: number;
}
export function useAdminUsers(): UseAdminUsersReturn & AdminUsersViewState {
  const [data, setData] = useState<{ users: AdminUser[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const refresh = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const result = await authClient.admin.listUsers({ query: { limit, offset, searchValue: search || undefined, searchField: "email", searchOperator: "contains" } });
      if (result.error) { setError(result.error.message ?? "Failed to load users"); return; }
      if (result.data) setData({ users: result.data.users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: isUserRole(user.role) ? user.role : "user", banned: user.banned ?? false })), total: result.data.total });
    } finally { setLoading(false); }
  }, [page, search]);
  useEffect(() => { void refresh(); }, [refresh]);
  const toggleBan = useCallback(async (userId: string, banned: boolean) => {
    if (banned) await authClient.admin.unbanUser({ userId }); else await authClient.admin.banUser({ userId });
    await refresh();
  }, [refresh]);
  const setRole = useCallback(async (userId: string, currentRole: UserRole) => {
    const role = currentRole === "admin" ? "user" : "admin";
    await authClient.admin.setRole({ userId, role });
    await refresh();
  }, [refresh]);
  return { data, error, loading, refresh, toggleBan, setRole, search, setSearch, page, setPage, limit };
}
`,
  );
}
