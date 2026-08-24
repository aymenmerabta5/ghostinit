export function adminLayoutSingleContent(): string {
  return [
    "import { headers } from 'next/headers';",
    "import { redirect } from 'next/navigation';",
    "import * as React from 'react';",
    "import { auth } from '@/server/auth';",
    "import { isSingleAdminRole } from '@/lib/access';",
    "import { AdminGuard } from '@/components/admin-guard';",
    "export default async function AdminLayout({ children }: { children: React.ReactNode }): Promise<React.JSX.Element> {",
    "  const session = await auth.api.getSession({ headers: await headers() });",
    "  if (!isSingleAdminRole(session?.user?.role)) redirect('/');",
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
    "import { isUserRole } from '@/lib/kernel';",
    "import type { AdminUser, UserRole, UseAdminUsersReturn } from '@/lib/kernel';",
    "interface AdminUsersViewState { search: string; setSearch: (search: string) => void; page: number; setPage: (page: number) => void; limit: number; }",
    "export function useAdminUsers(): UseAdminUsersReturn & AdminUsersViewState {",
    "  const [data, setData] = useState<{ users: AdminUser[]; total: number } | null>(null);",
    "  const [error, setError] = useState<string | null>(null);",
    "  const [loading, setLoading] = useState(true);",
    "  const [search, setSearch] = useState('');",
    "  const [page, setPage] = useState(1);",
    "  const limit = 20;",
    "  const refresh = useCallback(async () => { setError(null); setLoading(true); try { const offset = (page - 1) * limit; const result = await authClient.admin.listUsers({ query: { limit, offset, searchValue: search || undefined, searchField: 'email', searchOperator: 'contains' } }); if (result.error) { setError(result.error.message ?? 'Failed to load users'); return; } if (result.data) setData({ users: result.data.users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: isUserRole(user.role) ? user.role : 'user', banned: user.banned ?? false })), total: result.data.total }); } finally { setLoading(false); } }, [page, search]);",
    "  useEffect(() => { void refresh(); }, [refresh]);",
    "  const toggleBan = useCallback(async (userId: string, banned: boolean) => { if (banned) await authClient.admin.unbanUser({ userId }); else await authClient.admin.banUser({ userId }); await refresh(); }, [refresh]);",
    "  const setRole = useCallback(async (userId: string, currentRole: UserRole) => { const role = currentRole === 'admin' ? 'user' : 'admin'; await authClient.admin.setRole({ userId, role }); await refresh(); }, [refresh]);",
    "  return { data, error, loading, refresh, toggleBan, setRole, search, setSearch, page, setPage, limit };",
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
    'import type { AdminUser, UserRole } from "@/lib/kernel";',
    "export function UserRow({ user, onToggleBan, onSetRole }: { user: AdminUser; onToggleBan: (id: string, banned: boolean) => void; onSetRole: (id: string, role: UserRole) => void; }): React.JSX.Element {",
    "  const [banOpen, setBanOpen] = useState(false);",
    "  const [roleOpen, setRoleOpen] = useState(false);",
    "  return (<div className='flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between'><div className='flex flex-col gap-1 min-w-0'><div className='flex items-center gap-2'><p className='font-medium truncate'>{user.name ?? user.email}</p><Badge variant='secondary' className='capitalize'>{user.role}</Badge>{user.banned ? <Badge variant='destructive'>banned</Badge> : null}</div><p className='text-sm text-muted-foreground truncate'>{user.email}</p></div><div className='flex items-center gap-2 flex-wrap'><Dialog open={roleOpen} onOpenChange={setRoleOpen}><DialogTrigger render={<Button size='sm' variant='outline' />}>{user.role === 'admin' ? 'Demote' : 'Make admin'}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{user.role === 'admin' ? 'Demote?' : 'Make admin?'}</DialogTitle><DialogDescription>Change role for {user.email}</DialogDescription></DialogHeader><DialogFooter><Button variant='outline' onClick={() => setRoleOpen(false)}>Cancel</Button><Button onClick={() => { onSetRole(user.id, user.role); setRoleOpen(false); }}>Confirm</Button></DialogFooter></DialogContent></Dialog><Dialog open={banOpen} onOpenChange={setBanOpen}><DialogTrigger render={<Button size='sm' variant={user.banned ? 'default' : 'destructive'} />}>{user.banned ? 'Unban' : 'Ban'}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{user.banned ? 'Unban?' : 'Ban?'}</DialogTitle><DialogDescription>{user.banned ? 'Restore' : 'Revoke'} access for {user.email}</DialogDescription></DialogHeader><DialogFooter><Button variant='outline' onClick={() => setBanOpen(false)}>Cancel</Button><Button variant={user.banned ? 'default' : 'destructive'} onClick={() => { onToggleBan(user.id, user.banned); setBanOpen(false); }}>{user.banned ? 'Unban' : 'Ban'}</Button></DialogFooter></DialogContent></Dialog></div></div>);",
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
    "import { Input } from '@/components/ui/input';",
    "import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';",
    "import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty';",
    "import { Skeleton } from '@/components/ui/skeleton';",
    "import { useAdminUsers } from './hooks/use-admin-users';",
    "import { UserRow } from './components/user-row';",
    "export default function AdminUsersPage(): React.JSX.Element {",
    "  const { data, error, loading, toggleBan, setRole, search, setSearch, page, setPage, limit } = useAdminUsers();",
    "  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));",
    "  const searchDescriptionId = 'admin-user-search-description';",
    "  const searchErrorId = 'admin-user-search-error';",
    "  return (<div className='flex flex-col gap-6'><div className='flex flex-col gap-2'><div className='flex items-center justify-between gap-4'><h1 className='text-2xl font-semibold tracking-tight'>Users</h1><Button render={<Link href='/admin/users/create' />} nativeButton={false}>Create user</Button></div><p className='text-sm text-muted-foreground max-w-[65ch]'>Manage accounts, roles, and bans. Total {data?.total ?? 0} users.</p><div className='flex flex-col gap-3 sm:flex-row sm:items-end'><Field className='max-w-sm'><FieldLabel htmlFor='admin-user-search'>Search users</FieldLabel><Input id='admin-user-search' placeholder='Search email…' value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-describedby={error ? [searchDescriptionId, searchErrorId].join(' ') : searchDescriptionId} aria-errormessage={error ? searchErrorId : undefined} aria-invalid={error ? true : undefined} /><FieldDescription id={searchDescriptionId}>Filter accounts by email address.</FieldDescription></Field><div className='flex items-center gap-2'><span className='text-xs text-muted-foreground'>Page {page}/{totalPages}</span><Button size='sm' variant='outline' disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button><Button size='sm' variant='outline' disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></div></div><Separator />{error ? <Alert variant='destructive'><AlertTitle>Failed to load</AlertTitle><AlertDescription id={searchErrorId}>{error}</AlertDescription></Alert> : null}{loading && !data ? <div className='rounded-lg border bg-card divide-y divide-border overflow-hidden' aria-busy='true' aria-label='Loading users'>{Array.from({ length: 4 }).map((_, index) => <div key={index} className='flex items-center gap-4 p-4'><Skeleton className='size-8 rounded-full' /><div className='flex flex-col gap-2'><Skeleton className='h-3.5 w-40' /><Skeleton className='h-3 w-56' /></div></div>)}</div> : data?.users.length === 0 ? <Empty className='rounded-lg border bg-card'><EmptyHeader><EmptyTitle>{search ? 'No matching users' : 'No users yet'}</EmptyTitle><EmptyDescription>{search ? 'No account email matches this search.' : 'Accounts appear here as people sign up. Create the first one to get started.'}</EmptyDescription></EmptyHeader><EmptyContent className='flex justify-center'>{search ? <Button variant='outline' onClick={() => { setSearch(''); setPage(1); }}>Clear search</Button> : <Button render={<Link href='/admin/users/create' />} nativeButton={false}>Create user</Button>}</EmptyContent></Empty> : data ? <div className='rounded-lg border bg-card divide-y divide-border overflow-hidden'>{data.users.map((user) => <UserRow key={user.id} user={user} onToggleBan={toggleBan} onSetRole={setRole} />)}</div> : null}</div>);",
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
    // Each primitive lives in its own module; bundling them onto the card import
    // meant Input/Button/Alert/Separator were never exported from there (TS2305).
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';",
    "import { Input } from '@/components/ui/input';",
    "import { Button } from '@/components/ui/button';",
    "import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';",
    "import { Separator } from '@/components/ui/separator';",
    "import { FieldGroup, Field, FieldLabel, FieldDescription } from '@/components/ui/field';",
    "import { Form, Field as TanStackField, SubmitButton, useForm } from '@/components/ui/form';",
    "import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';",
    "import { Spinner } from '@/components/ui/spinner';",
    "import { isUserRole } from '@/lib/kernel';",
    "import type { UserRole } from '@/lib/kernel';",
    "interface CreateUserForm { name: string; email: string; password: string; role: UserRole; }",
    "const ROLE_OPTIONS = [{ label: 'User', value: 'user' }, { label: 'Admin', value: 'admin' }] satisfies readonly { label: string; value: UserRole }[];",
    "export default function AdminCreateUserPage(): React.JSX.Element {",
    "  const router = useRouter();",
    "  const [error, setError] = useState<string | null>(null);",
    "  const defaultValues: CreateUserForm = { name: '', email: '', password: '', role: 'user' };",
    "  const form = useForm({ defaultValues, onSubmit: async ({ value }) => { setError(null); const r = await authClient.admin.createUser({ name: value.name, email: value.email, password: value.password, role: value.role }); if (r.error) { setError(r.error.message ?? 'Failed'); return; } router.push('/admin/users'); }});",
    "  return (<div className='mx-auto flex w-full max-w-xl flex-col gap-8 p-6 md:p-0'><div className='flex flex-col gap-2'><div className='flex items-center justify-between gap-4'><h1 className='text-2xl font-semibold tracking-tight'>Create user</h1><Button variant='ghost' size='sm' render={<Link href='/admin/users' />} nativeButton={false}>Back</Button></div><p className='text-sm text-muted-foreground'>Add new account.</p></div><Separator /><Card><CardHeader><CardTitle>User details</CardTitle><CardDescription>Password &ge;8. Role determines access.</CardDescription></CardHeader><CardContent className='flex flex-col gap-6'>{error ? <Alert variant='destructive'><AlertTitle>Failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}<Form form={form} className='flex flex-col gap-6'><FieldGroup><TanStackField form={form} name='name'>{(field) => (<Field><FieldLabel htmlFor='create-user-name'>Name</FieldLabel><Input id='create-user-name' value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} /><FieldDescription>Display name for the account.</FieldDescription></Field>)}</TanStackField><TanStackField form={form} name='email' validators={{ onSubmit: ({ value }) => (value.includes('@') ? undefined : 'Enter valid email') }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor='create-user-email'>Email</FieldLabel><Input id='create-user-email' type='email' value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} aria-invalid={field.state.meta.errors.length > 0} /><FieldDescription>Account email address.</FieldDescription></Field>)}</TanStackField><TanStackField form={form} name='password' validators={{ onSubmit: ({ value }) => (value.length >= 8 ? undefined : 'Password must be at least 8 characters') }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor='create-user-password'>Password</FieldLabel><Input id='create-user-password' type='password' value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} aria-invalid={field.state.meta.errors.length > 0} /><FieldDescription>At least 8 characters.</FieldDescription></Field>)}</TanStackField><TanStackField form={form} name='role'>{(field) => (<Field><FieldLabel id='role-label' htmlFor='role'>Role</FieldLabel><Select items={ROLE_OPTIONS} value={field.state.value} onValueChange={(role) => { if (isUserRole(role)) field.handleChange(role); }}><SelectTrigger id='role' aria-labelledby='role-label' onBlur={field.handleBlur}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value='user'>User</SelectItem><SelectItem value='admin'>Admin</SelectItem></SelectGroup></SelectContent></Select><FieldDescription>Admins can manage all users.</FieldDescription></Field>)}</TanStackField></FieldGroup><form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>{([canSubmit, isSubmitting]) => (<SubmitButton disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon='inline-start' /> : null}{isSubmitting ? 'Creating user…' : 'Create user'}</SubmitButton>)}</form.Subscribe></Form></CardContent></Card></div>);",
    "}",
    "",
  ].join("\n");
}
