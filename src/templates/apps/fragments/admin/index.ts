import { file, type TemplateFile } from "../../../shared.js";
import { adminLayout } from "./layout.js";
import { adminDashboardPage } from "./dashboard.js";
import { useAdminUsersHook } from "./hooks.js";
import { adminUserRow } from "./user-row.js";
import { adminUsersPage } from "./users-page.js";
import { adminCreateUserPage } from "./create-user-page.js";

export {
  adminLayout,
  adminDashboardPage,
  useAdminUsersHook,
  adminUserRow,
  adminUsersPage,
  adminCreateUserPage,
};

export function adminFiles(): TemplateFile[] {
  return [
    adminLayout(),
    adminDashboardPage(),
    useAdminUsersHook(),
    adminUserRow(),
    adminUsersPage(),
    adminCreateUserPage(),
  ];
}

export function tanstackAdminDashboardContent(): string {
  return `import * as React from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'

const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<unknown> } }).api.getSession({ headers })
  return session as { user?: { role?: string; email?: string; name?: string | null } } | null
})

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user || (session.user as { role?: string }).role !== 'admin') throw redirect({ to: '/' })
    return { session }
  },
  component: AdminPage,
})

function AdminPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <Link to="/admin/users" className="text-sm underline">Manage users</Link>
        </div>
        <p className="text-sm text-muted-foreground max-w-[65ch]">Admin dashboard — manage users and roles.</p>
      </div>
    </main>
  )
}
`;
}

export function tanstackAdminUsersContent(): string {
  return `import * as React from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { authClient } from '../lib/auth-client.js'
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<unknown> } }).api.getSession({ headers })
  return session as { user?: { role?: string } } | null
})

export const Route = createFileRoute('/admin/users')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user || (session.user as { role?: string }).role !== 'admin') throw redirect({ to: '/' })
    return { session }
  },
  component: AdminUsersPage,
})

type AdminUser = { id: string; name: string | null; email: string; role: string; banned: boolean }

function AdminUsersPage(): React.JSX.Element {
  const [data, setData] = React.useState<{ users: AdminUser[]; total: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const limit = 20
  const refresh = React.useCallback(async () => {
    setError(null)
    try {
      const offset = (page - 1) * limit
      const result = await authClient.admin.listUsers({ query: { limit, offset, search: search || undefined } as unknown as { limit: number; offset: number; search?: string } })
      if ((result as { error?: { message?: string } }).error) { setError((result as { error: { message?: string } }).error.message ?? "Failed to load users"); return }
      const d = (result as { data?: { users: Array<{ id: string; name: string | null; email: string; role?: string; banned?: boolean }>; total: number } }).data
      if (d) setData({ users: d.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role ?? "user", banned: u.banned ?? false })), total: d.total })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [page, search])
  React.useEffect(() => { void refresh() }, [refresh])
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit))
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <Button asChild><Link to="/admin/users/create">Create user</Link></Button>
          </div>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Manage accounts, roles, and bans. Total {data?.total ?? 0} users.</p>
          <div className="flex items-center gap-2">
            <input placeholder="Search email or name…" value={search} onChange={(e) => { setSearch((e.target as HTMLInputElement).value); setPage(1); }} className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm" />
            <span className="text-xs text-muted-foreground">Page {page}/{totalPages}</span>
            <Button size="sm" variant="outline" disabled={page<=1} onClick={() => setPage(page-1)}>Prev</Button>
            <Button size="sm" variant="outline" disabled={page>=totalPages} onClick={() => setPage(page+1)}>Next</Button>
          </div>
        </div>
        <Separator />
        {error ? <Alert variant="destructive"><AlertTitle>Failed to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <Card>
          <CardHeader><CardTitle className="text-base">All users</CardTitle><CardDescription>{data?.users.length === 0 ? "No users found." : \`\${data?.users.length ?? 0} users\`}</CardDescription></CardHeader>
          <CardContent className="divide-y divide-border">
            {data?.users.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No users found.</div> : data?.users.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2"><p className="font-medium truncate">{user.name ?? user.email}</p><Badge variant="secondary" className="capitalize">{user.role}</Badge>{user.banned ? <Badge variant="destructive">banned</Badge> : null}</div>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={async () => { const role = user.role === "admin" ? "user" : "admin"; await authClient.admin.setRole({ userId: user.id, role: role as "admin" | "user" }); await refresh() }}>{user.role === "admin" ? "Demote" : "Make admin"}</Button><Button size="sm" variant={user.banned ? "default" : "destructive"} onClick={async () => { if (user.banned) await authClient.admin.unbanUser({ userId: user.id }); else await authClient.admin.banUser({ userId: user.id }); await refresh() }}>{user.banned ? "Unban" : "Ban"}</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Audit log: every ban/role change is persisted via better-auth and can be extended to @repo/observability.</p>
      </div>
    </main>
  )
}
`;
}

export function tanstackAdminCreateUserContent(): string {
  return `import * as React from 'react'
import { createFileRoute, redirect, Link, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { auth } from '@repo/auth'
import { authClient } from '../lib/auth-client.js'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";

const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<unknown> } }).api.getSession({ headers })
  return session as { user?: { role?: string } } | null
})

export const Route = createFileRoute('/admin/users/create')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user || (session.user as { role?: string }).role !== 'admin') throw redirect({ to: '/' })
    return { session }
  },
  component: AdminCreateUserPage,
})

interface CreateUserForm { name: string; email: string; password: string; role: 'admin' | 'user'; }
const createUserSchema = z.object({ name: z.string().min(1, 'Name required'), email: z.string().email('Enter a valid email'), password: z.string().min(8, 'Password must be at least 8 characters'), role: z.enum(['admin','user']) })

function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm({
    defaultValues: { name: '', email: '', password: '', role: 'user' } as CreateUserForm,
    validators: { onSubmit: ({ value }) => { const p = createUserSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message } },
    onSubmit: async ({ value }) => {
      setError(null)
      const parsed = createUserSchema.safeParse(value)
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Invalid input'); return }
      const result = await authClient.admin.createUser({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, role: parsed.data.role })
      const r = result as unknown as { error?: { message?: string } }
      if (r.error) { setError(r.error.message ?? 'Failed to create user'); return }
      router.navigate({ to: '/admin/users' })
    },
  })
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-xl flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold tracking-tight">Create user</h1><Button variant="ghost" size="sm" asChild><Link to="/admin/users">Back to users</Link></Button></div>
        <p className="text-sm text-muted-foreground max-w-[65ch]">Add a new account. Admins can manage all users.</p>
        <Separator />
        <Card><CardHeader><CardTitle className="text-base">User details</CardTitle><CardDescription>Password must be at least 8 characters.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error ? <Alert variant="destructive"><AlertTitle>Failed to create</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup>
                <TanStackField form={form} name="name" validators={{ onChange: ({ value }) => (value.trim().length ? undefined : 'Name required') }}>{(f) => (<Field data-invalid={f.state.meta.errors.length > 0}><FieldLabel>Name</FieldLabel><Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} placeholder="Ada Lovelace" />{f.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(f.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField>
                <TanStackField form={form} name="email" validators={{ onChange: ({ value }) => (value.includes('@') ? undefined : 'Enter a valid email'), onSubmit: ({ value }) => (z.string().email().safeParse(value).success ? undefined : 'Enter a valid email') }}>{(f) => (<Field data-invalid={f.state.meta.errors.length > 0}><FieldLabel>Email</FieldLabel><Input type="email" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} placeholder="you@example.com" />{f.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(f.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField>
                <TanStackField form={form} name="password" validators={{ onChange: ({ value }) => (value.length >= 8 ? undefined : 'Password must be at least 8 characters'), onSubmit: ({ value }) => (value.length >= 8 ? undefined : 'Password must be at least 8 characters') }}>{(f) => (<Field data-invalid={f.state.meta.errors.length > 0}><FieldLabel>Password</FieldLabel><Input type="password" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} />{f.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(f.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField>
                <TanStackField form={form} name="role">{(f) => (<Field><FieldLabel>Role</FieldLabel><select value={f.state.value} onChange={(e) => f.handleChange(e.target.value as "admin" | "user")} onBlur={f.handleBlur} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="user">User</option><option value="admin">Admin</option></select></Field>)}</TanStackField>
              </FieldGroup>
              <SubmitButton>Create user</SubmitButton>
            </Form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
`;
}

export function tanstackAdminFiles(): TemplateFile[] {
  return [
    file("apps/web/src/routes/admin.tsx", tanstackAdminDashboardContent()),
    file("apps/web/src/routes/admin.users.tsx", tanstackAdminUsersContent()),
    file("apps/web/src/routes/admin.users.create.tsx", tanstackAdminCreateUserContent()),
  ];
}
