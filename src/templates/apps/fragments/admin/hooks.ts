import { file, type TemplateFile } from "../../../shared.js";
export function useAdminUsersHook(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/hooks/use-admin-users.ts",
    `"use client";
import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { authClient } from "../../../../lib/auth-client.js";
export interface AdminUser { id: string; name: string | null; email: string; role: string; banned: boolean; }
export interface UseAdminUsersReturn { data: { users: AdminUser[]; total: number } | null; error: string | null; loading: boolean; refresh: () => Promise<void>; toggleBan: (userId: string, banned: boolean) => Promise<void>; setRole: (userId: string, currentRole: string) => Promise<void>; }
export function useAdminUsers(): UseAdminUsersReturn {
  const [data, setData] = useState<{ users: AdminUser[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const result = await authClient.admin.listUsers({ query: { limit: 100 } });
      if (result.error) { setError(result.error.message ?? "Failed to load users"); return; }
      if (result.data) setData({ users: result.data.users.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role ?? "user", banned: u.banned ?? false })), total: result.data.total });
    } finally { setLoading(false); }
  }, []);
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
  return { data, error, loading, refresh, toggleBan, setRole };
}
`,
  );
}
