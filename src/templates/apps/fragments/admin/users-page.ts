import { file, type TemplateFile } from "../../../shared.js";
export function adminUsersPage(): TemplateFile {
  return file(
    "apps/web/src/app/admin/users/page.tsx",
    `"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useAdminUsers } from "./hooks/use-admin-users.js";
import { UserRow } from "./components/user-row.js";
export default function AdminUsersPage(): React.JSX.Element {
  const { data, error, toggleBan, setRole, search, setSearch, page, setPage, limit } = useAdminUsers() as unknown as { data: { users: Array<{id:string;name:string|null;email:string;role:string;banned:boolean}>; total:number } | null; error: string | null; toggleBan:(a:string,b:boolean)=>void; setRole:(a:string,b:string)=>void; search:string; setSearch:(s:string)=>void; page:number; setPage:(n:number)=>void; limit:number };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Users</h1><Button asChild><Link href="/admin/users/create">Create user</Link></Button></div>
        <p className="text-sm text-muted-foreground max-w-[65ch]">Manage accounts, roles, and bans. Total {data?.total ?? 0} users.</p>
        <div className="flex items-center gap-2">
          <input placeholder="Search email or name…" value={search} onChange={(e)=>{ setSearch((e.target as HTMLInputElement).value); setPage(1); }} className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm" />
          <span className="text-xs text-muted-foreground">Page {page}/{totalPages}</span>
          <Button size="sm" variant="outline" disabled={page<=1} onClick={()=> setPage(page-1)}>Prev</Button>
          <Button size="sm" variant="outline" disabled={page>=totalPages} onClick={()=> setPage(page+1)}>Next</Button>
        </div>
      </div>
      <Separator />
      {error ? <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="rounded-lg border bg-card divide-y divide-border overflow-hidden">
        {data?.users.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No users found.</div> : data?.users.map((user) => (<UserRow key={user.id} user={user} onToggleBan={toggleBan} onSetRole={setRole} />))}
      </div>
      <p className="text-xs text-muted-foreground">Audit log: every ban/role change is persisted via better-auth and can be extended to @repo/observability.</p>
    </div>
  );
}
`,
  );
}
