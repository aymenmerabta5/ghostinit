export function adminLayoutSingleContent(): string {
  return [
    "import { headers } from 'next/headers';",
    "import { redirect } from 'next/navigation';",
    "import * as React from 'react';",
    "import { auth } from '@/server/auth';",
    "import { AdminGuard } from '@/components/admin-guard';",
    "export default async function AdminLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {",
    "  const session = await auth.api.getSession({ headers: await headers() });",
    "  if (session?.user?.role !== 'admin') redirect('/');",
    "  return <AdminGuard>{children}</AdminGuard>;",
    "}",
    "",
  ].join("\n");
}

export function adminDashboardSingleFileContent(): string {
  return [
    "import { redirect } from 'next/navigation';",
    "export default async function AdminDashboardPage(): Promise<never> { redirect('/admin/users'); }",
    "",
  ].join("\n");
}

export function useAdminUsersHookSingleContent(): string {
  return [
    '"use client";',
    "import * as React from 'react';",
    "import { useCallback, useEffect, useState } from 'react';",
    "import { authClient } from '@/lib/auth-client';",
    "export interface AdminUser { id: string; name: string | null; email: string; role: string; banned: boolean; }",
    "export function useAdminUsers() {",
    "  const [data, setData] = useState<{ users: AdminUser[]; total: number } | null>(null);",
    "  const [error, setError] = useState<string | null>(null);",
    "  const [loading, setLoading] = useState(true);",
    "  const refresh = useCallback(async () => { setError(null); setLoading(true); try { const result = await authClient.admin.listUsers({ query: { limit: 100 } }); if (result.error) { setError(result.error.message ?? 'Failed'); return; } if (result.data) setData({ users: result.data.users.map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role ?? 'user', banned: u.banned ?? false })), total: result.data.total }); } finally { setLoading(false); } }, []);",
    "  useEffect(() => { void refresh(); }, [refresh]);",
    "  const toggleBan = useCallback(async (userId: string, banned: boolean) => { if (banned) await authClient.admin.unbanUser({ userId }); else await authClient.admin.banUser({ userId }); await refresh(); }, [refresh]);",
    "  const setRole = useCallback(async (userId: string, currentRole: string) => { const role = currentRole === 'admin' ? 'user' : 'admin'; await authClient.admin.setRole({ userId, role: role as any }); await refresh(); }, [refresh]);",
    "  return { data, error, loading, refresh, toggleBan, setRole };",
    "}",
    "",
  ].join("\n");
}

export function adminUserRowSingleContent(): string {
  return [
    '"use client";',
    "import * as React from 'react';",
    "import { useState } from 'react';",
    "import { Badge } from '@/components/ui/badge';",
    "import { Button } from '@/components/ui/button';",
    "import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';",
    "import type { AdminUser } from '../hooks/use-admin-users';",
    "export function UserRow({ user, onToggleBan, onSetRole }: { user: AdminUser; onToggleBan: (id: string, banned: boolean) => void; onSetRole: (id: string, role: string) => void; }): React.JSX.Element {",
    "  const [banOpen, setBanOpen] = useState(false);",
    "  const [roleOpen, setRoleOpen] = useState(false);",
    "  return (<div className='flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between'><div className='flex flex-col gap-1 min-w-0'><div className='flex items-center gap-2'><p className='font-medium truncate'>{user.name ?? user.email}</p><Badge variant='secondary' className='capitalize'>{user.role}</Badge>{user.banned ? <Badge variant='destructive'>banned</Badge> : null}</div><p className='text-sm text-muted-foreground truncate'>{user.email}</p></div><div className='flex items-center gap-2 flex-wrap'><Dialog open={roleOpen} onOpenChange={setRoleOpen}><DialogTrigger asChild><Button size='sm' variant='outline'>{user.role === 'admin' ? 'Demote' : 'Make admin'}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{user.role === 'admin' ? 'Demote?' : 'Make admin?'}</DialogTitle><DialogDescription>Change role for {user.email}</DialogDescription></DialogHeader><DialogFooter><Button variant='outline' onClick={() => setRoleOpen(false)}>Cancel</Button><Button onClick={() => { onSetRole(user.id, user.role); setRoleOpen(false); }}>Confirm</Button></DialogFooter></DialogContent></Dialog><Dialog open={banOpen} onOpenChange={setBanOpen}><DialogTrigger asChild><Button size='sm' variant={user.banned ? 'default' : 'destructive'}>{user.banned ? 'Unban' : 'Ban'}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{user.banned ? 'Unban?' : 'Ban?'}</DialogTitle><DialogDescription>{user.banned ? 'Restore' : 'Revoke'} access for {user.email}</DialogDescription></DialogHeader><DialogFooter><Button variant='outline' onClick={() => setBanOpen(false)}>Cancel</Button><Button variant={user.banned ? 'default' : 'destructive'} onClick={() => { onToggleBan(user.id, user.banned); setBanOpen(false); }}>{user.banned ? 'Unban' : 'Ban'}</Button></DialogFooter></DialogContent></Dialog></div></div>);",
    "}",
    "",
  ].join("\n");
}

export function adminUsersPageSingleFileContent(): string {
  return [
    '"use client";',
    "import * as React from 'react';",
    "import Link from 'next/link';",
    "import { Button } from '@/components/ui/button';",
    "import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';",
    "import { Separator } from '@/components/ui/separator';",
    "import { useAdminUsers } from './hooks/use-admin-users';",
    "import { UserRow } from './components/user-row';",
    "export default function AdminUsersPage(): React.JSX.Element {",
    "  const { data, error, toggleBan, setRole } = useAdminUsers();",
    "  return (<div className='flex flex-col gap-6'><div className='flex flex-col gap-2'><div className='flex items-center justify-between gap-4'><h1 className='text-2xl font-semibold tracking-tight'>Users</h1><Button asChild><Link href='/admin/users/create'>Create user</Link></Button></div><p className='text-sm text-muted-foreground max-w-[65ch]'>Manage accounts roles bans Total {data?.total ?? 0} users.</p></div><Separator />{error ? <Alert variant='destructive'><AlertTitle>Failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<div className='rounded-lg border bg-card divide-y overflow-hidden'>{data?.users.length === 0 ? <div className='p-8 text-center text-sm text-muted-foreground'>No users.</div> : data?.users.map((u) => <UserRow key={u.id} user={u} onToggleBan={toggleBan} onSetRole={setRole} />)}</div></div>);",
    "}",
    "",
  ].join("\n");
}

export function adminCreateUserPageSingleFileContent(): string {
  return [
    '"use client";',
    "import * as React from 'react';",
    "import { useRouter } from 'next/navigation';",
    "import { useState } from 'react';",
    "import Link from 'next/link';",
    "import { authClient } from '@/lib/auth-client';",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Button, Alert, AlertTitle, AlertDescription, Separator } from '@/components/ui/card';",
    "import { FieldGroup, Field, FieldLabel, FieldDescription } from '@/components/ui/field';",
    "import { Form, Field as TanStackField, SubmitButton, useForm } from '@/components/ui/form';",
    "interface CreateUserForm { name: string; email: string; password: string; role: 'admin' | 'user'; }",
    "export default function AdminCreateUserPage(): React.JSX.Element {",
    "  const router = useRouter();",
    "  const [error, setError] = useState<string | null>(null);",
    "  const form = useForm({ defaultValues: { name: '', email: '', password: '', role: 'user' } as CreateUserForm, onSubmit: async ({ value }) => { setError(null); const r = await authClient.admin.createUser({ name: value.name, email: value.email, password: value.password, role: value.role }); if (r.error) { setError(r.error.message ?? 'Failed'); return; } router.push('/admin/users'); }});",
    "  return (<div className='mx-auto flex w-full max-w-xl flex-col gap-8 p-6 md:p-0'><div className='flex flex-col gap-2'><div className='flex items-center justify-between gap-4'><h1 className='text-2xl font-semibold tracking-tight'>Create user</h1><Button variant='ghost' size='sm' asChild><Link href='/admin/users'>Back</Link></Button></div><p className='text-sm text-muted-foreground'>Add new account.</p></div><Separator /><Card><CardHeader><CardTitle>User details</CardTitle><CardDescription>Password >=8 Role determines access.</CardDescription></CardHeader><CardContent className='flex flex-col gap-6'>{error ? <Alert variant='destructive'><AlertTitle>Failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<Form form={form} className='flex flex-col gap-6'><FieldGroup><TanStackField form={form} name='name'>{(f) => (<Field><FieldLabel>Name</FieldLabel><Input value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} /></Field>)}</TanStackField><TanStackField form={form} name='email' validators={{ onSubmit: ({ value }) => (value.includes('@') ? undefined : 'Enter valid email') }}>{(f) => (<Field><FieldLabel>Email</FieldLabel><Input type='email' value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} /></Field>)}</TanStackField><TanStackField form={form} name='password' validators={{ onSubmit: ({ value }) => (value.length >= 8 ? undefined : 'Password >=8') }}>{(f) => (<Field><FieldLabel>Password</FieldLabel><Input type='password' value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} onBlur={f.handleBlur} /></Field>)}</TanStackField><TanStackField form={form} name='role'>{(f) => (<Field><FieldLabel>Role</FieldLabel><select value={f.state.value} onChange={(e) => f.handleChange(e.target.value as any)} onBlur={f.handleBlur} className='flex h-10 w-full rounded-md border bg-background px-3 text-sm'><option value='user'>User</option><option value='admin'>Admin</option></select></Field>)}</TanStackField></FieldGroup><SubmitButton>Create user</SubmitButton></Form></CardContent></Card></div>);",
    "}",
    "",
  ].join("\n");
}
