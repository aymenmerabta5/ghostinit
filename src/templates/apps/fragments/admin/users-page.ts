import { file, type TemplateFile } from "../../../shared.js";
export function adminUsersPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/page.tsx",
    `"use client";
import * as React from "react";
import Link from "next/link";
import { Button, Alert, AlertTitle, AlertDescription, Separator } from "@repo/ui";
import { useAdminUsers } from "./hooks/use-admin-users.js";
import { UserRow } from "./components/user-row.js";
export default function AdminUsersPage(): React.JSX.Element {
  const { data, error, toggleBan, setRole } = useAdminUsers();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Users</h1><Button asChild><Link href="/admin/users/create">Create user</Link></Button></div>
        <p className="text-sm text-muted-foreground max-w-[65ch]">Manage accounts, roles, and bans. Total {data?.total ?? 0} users.</p>
      </div>
      <Separator />
      {error ? <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="rounded-lg border bg-card divide-y divide-border overflow-hidden">
        {data?.users.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No users found.</div> : data?.users.map((user) => (<UserRow key={user.id} user={user} onToggleBan={toggleBan} onSetRole={setRole} />))}
      </div>
    </div>
  );
}
`,
  );
}
