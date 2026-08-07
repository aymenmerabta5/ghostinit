import { file, type TemplateFile } from "../../../shared.js";
export function useAdminUsersHook(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/hooks/use-admin-users.ts",
    `"use client";
import { useEffect, useState, useCallback } from "react";
import { authClient } from "../../../../lib/auth-client.js";
import type { AdminUser, UseAdminUsersReturn } from "@repo/kernel";
export function useAdminUsers(): UseAdminUsersReturn {
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
      const result = await authClient.admin.listUsers({ query: { limit, offset, search: search || undefined } as unknown as { limit:number; offset:number; search?:string } });
      if (result.error) { setError(result.error.message ?? "Failed to load users"); return; }
      if (result.data) setData({ users: result.data.users.map((u: { id: string; name: string | null; email: string; role?: string | null; banned?: boolean | null }) => ({ id: u.id, name: u.name, email: u.email, role: u.role ?? "user", banned: u.banned ?? false })), total: result.data.total });
    } finally { setLoading(false); }
  }, [page, search]);
  useEffect(() => { void refresh(); }, [refresh]);
  const toggleBan = useCallback(async (userId: string, banned: boolean) => {
    if (banned) await authClient.admin.unbanUser({ userId }); else await authClient.admin.banUser({ userId });
    await refresh();
  }, [refresh]);
  const setRole = useCallback(async (userId: string, currentRole: string) => {
    const role = currentRole === "admin" ? "user" : "admin";
    await authClient.admin.setRole({ userId, role: role as "admin" | "user" });
    await refresh();
  }, [refresh]);
  return { data, error, loading, refresh, toggleBan, setRole, search, setSearch, page, setPage, limit };
}
`,
  );
}
