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
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { useAdminUsers } from "./hooks/use-admin-users.js";
import { UserRow } from "./components/user-row.js";
export default function AdminUsersPage(): React.JSX.Element {
  const { data, error, toggleBan, setRole, search, setSearch, page, setPage, limit } = useAdminUsers();
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const isLoading = !data && !error;
  const searchDescriptionId = "admin-user-search-description";
  const searchErrorId = "admin-user-search-error";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Users</h1><Button render={<Link href="/admin/users/create" />} nativeButton={false}>Create user</Button></div>
        <p className="text-sm text-muted-foreground max-w-[65ch]">Manage accounts, roles, and bans. Total {data?.total ?? 0} users.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="max-w-sm">
            <FieldLabel htmlFor="admin-user-search">Search users</FieldLabel>
            <Input id="admin-user-search" placeholder="Search email…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-describedby={error ? [searchDescriptionId, searchErrorId].join(" ") : searchDescriptionId} aria-errormessage={error ? searchErrorId : undefined} aria-invalid={error ? true : undefined} />
            <FieldDescription id={searchDescriptionId}>Filter accounts by email address.</FieldDescription>
          </Field>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Page {page}/{totalPages}</span>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      </div>
      <Separator />
      {error ? <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription id={searchErrorId}>{error}</AlertDescription></Alert> : null}
      {isLoading ? (
        <div className="rounded-lg border bg-card divide-y divide-border overflow-hidden" aria-busy="true" aria-label="Loading users">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-col gap-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-56" /></div>
              <Skeleton className="ml-auto h-6 w-20" />
            </div>
          ))}
        </div>
      ) : data && data.users.length === 0 ? (
        <Empty className="rounded-lg border bg-card">
          <EmptyHeader>
            <EmptyTitle>{search ? "No matching users" : "No users yet"}</EmptyTitle>
            <EmptyDescription>{search ? \`Nothing matches "\${search}". Try a different email or name.\` : "Accounts appear here as people sign up. Create the first one to get started."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex justify-center">
            {search ? <Button variant="outline" onClick={() => { setSearch(""); setPage(1); }}>Clear search</Button> : <Button render={<Link href="/admin/users/create" />} nativeButton={false}>Create user</Button>}
          </EmptyContent>
        </Empty>
      ) : data ? (
        <div className="rounded-lg border bg-card divide-y divide-border overflow-hidden">
          {data.users.map((user) => (<UserRow key={user.id} user={user} onToggleBan={toggleBan} onSetRole={setRole} />))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Audit log: every ban/role change is persisted via better-auth and can be extended to @repo/observability.</p>
    </div>
  );
}
`,
  );
}
