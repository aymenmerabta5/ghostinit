export function singleDashboardRouteTanstackContent(): string {
  return [
    "import * as React from 'react'",
    "import { createFileRoute, redirect, Link } from '@tanstack/react-router'",
    "import { createServerFn } from '@tanstack/react-start'",
    "import { getRequestHeaders } from '@tanstack/react-start/server'",
    "import { auth } from '@/server/auth'",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'",
    "import { Badge } from '@/components/ui/badge'",
    "import { Button } from '@/components/ui/button'",
    "import { Separator } from '@/components/ui/separator'",
    "",
    "const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {",
    "  const headers = getRequestHeaders() as unknown as Headers",
    "  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<{ user?: { email?: string; name?: string | null; role?: string } } | null> } }).api.getSession({ headers })",
    "  return session ?? null",
    "})",
    "",
    "export const Route = createFileRoute('/dashboard')({",
    "  beforeLoad: async () => {",
    "    const session = await getSessionFn()",
    "    if (!session?.user) { throw redirect({ to: '/sign-in' }) }",
    "    return { session }",
    "  },",
    "  component: DashboardPage,",
    "})",
    "",
    "function DashboardPage(): React.JSX.Element {",
    "  const { session } = Route.useRouteContext() as { session: { user: { email: string; name?: string | null; role?: string } } }",
    "  const user = session?.user",
    "  return (",
    "    <main className='min-h-screen bg-background text-foreground'>",
    "      <div className='mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8 lg:p-10'>",
    "        <div className='flex flex-col gap-2'>",
    "          <div className='flex items-center justify-between gap-4'>",
    "            <h1 className='text-2xl font-semibold tracking-tight'>Dashboard</h1>",
    "            <div className='flex items-center gap-2'>",
    "              <Button variant='ghost' size='sm' asChild><Link to='/settings'>Settings</Link></Button>",
    "              <Button variant='outline' size='sm' asChild><Link to='/billing'>Billing</Link></Button>",
    "            </div>",
    "          </div>",
    "          <p className='text-sm text-muted-foreground max-w-[65ch]'>Welcome back. Manage your account, billing, and modules.</p>",
    "        </div>",
    "        <Separator />",
    "        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>",
    "          <Card className='md:col-span-2'>",
    "            <CardHeader>",
    "              <div className='flex items-center justify-between gap-3'>",
    "                <CardTitle className='text-base'>Profile</CardTitle>",
    "                <Badge variant='secondary' className='capitalize'><span className='flex items-center gap-1.5'><span className='size-1.5 rounded-full bg-primary' /> {String(user?.role ?? 'user')}</span></Badge>",
    "              </div>",
    "              <CardDescription className='max-w-[60ch]'>Signed in as {String(user?.email ?? '')}. Name {String(user?.name ?? 'not set')}.</CardDescription>",
    "            </CardHeader>",
    "            <CardContent className='flex flex-col gap-3'>",
    "              <div className='flex flex-wrap gap-2'>",
    "                <Button variant='outline' size='sm' asChild><Link to='/settings'>Edit profile</Link></Button>",
    "                <Button variant='outline' size='sm' asChild><Link to='/billing'>Billing</Link></Button>",
    "                <Button variant='outline' size='sm' asChild><Link to='/admin'>Admin</Link></Button>",
    "              </div>",
    "            </CardContent>",
    "          </Card>",
    "          <Card>",
    "            <CardHeader><CardTitle className='text-base'>Quick actions</CardTitle></CardHeader>",
    "            <CardContent className='flex flex-col gap-2'>",
    "              <Button variant='outline' size='sm' asChild><Link to='/settings'>Security & 2FA</Link></Button>",
    "              <Button variant='outline' size='sm' asChild><Link to='/billing'>Manage billing</Link></Button>",
    "            </CardContent>",
    "          </Card>",
    "        </div>",
    "      </div>",
    "    </main>",
    "  )",
    "}",
    "",
  ].join("\n");
}

function settingsRequestUserImports(isConvex: boolean): string {
  return isConvex
    ? `import { getRequestUser } from '@/server/auth'`
    : `import { getRequestHeaders } from '@tanstack/react-start/server'
import { getRequestUser } from '@/server/auth'`;
}

function settingsRequestUserServerFn(isConvex: boolean): string {
  return isConvex
    ? `const getRequestUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await getRequestUser()
})`
    : `const getRequestUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders()
  return await getRequestUser(headers)
})`;
}

export function singleSettingsRouteTanstackContent(isConvex = false): string {
  return `import * as React from 'react'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
${settingsRequestUserImports(isConvex)}
import { authClient } from '@/lib/auth-client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

type SettingsAction = '/2fa' | '/dashboard'
const SETTINGS_ACTIONS = [
  { label: 'Two-factor authentication', value: '/2fa' },
  { label: 'Dashboard', value: '/dashboard' },
] satisfies readonly { label: string; value: SettingsAction }[]
function isSettingsAction(value: unknown): value is SettingsAction {
  return value === '/2fa' || value === '/dashboard'
}

${settingsRequestUserServerFn(isConvex)}

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const user = await getRequestUserFn()
    if (!user) throw redirect({ to: '/sign-in' })
    return { user }
  },
  component: SettingsPage,
})

function SettingsPage(): React.JSX.Element {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const [securityAction, setSecurityAction] = React.useState<SettingsAction>('/2fa')
  const [deletePassword, setDeletePassword] = React.useState('')
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  async function handleDelete(): Promise<void> {
    setDeleteError(null)
    const result = await authClient.deleteUser({ password: deletePassword })
    if (result.error) { setDeleteError(result.error.message ?? 'Failed to delete account'); return }
    setDeleteOpen(false)
    void navigate({ to: '/' })
  }
  return (
    <main className='min-h-screen bg-background p-6 md:p-8'>
      <div className='mx-auto max-w-5xl flex flex-col gap-8'>
        <div className='flex flex-col gap-2'>
          <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
          <p className='text-sm text-muted-foreground max-w-[65ch]'>Manage account and workspace preferences.</p>
        </div>
        <Separator />
        <div className='grid gap-6 md:grid-cols-3'>
          <Card className='md:col-span-2'>
            <CardHeader><CardTitle className='text-base'>Profile</CardTitle><CardDescription className='max-w-[60ch]'>Signed in as {user.email}. Role {user.role ?? 'user'}.</CardDescription></CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <Field>
                <FieldLabel htmlFor='settings-name'>Name</FieldLabel>
                <Input id='settings-name' value={user.name} readOnly aria-describedby='settings-name-description' />
                <FieldDescription id='settings-name-description'>Update your display name from an authenticated profile form.</FieldDescription>
              </Field>
              <div className='flex items-center gap-2'><Badge variant='secondary'>{user.role ?? 'user'}</Badge><Badge variant='outline'>{user.email}</Badge></div>
              <Button variant='outline' size='sm' render={<Link to='/dashboard' />} nativeButton={false}>Dashboard</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className='text-base'>Security</CardTitle><CardDescription>Choose the next account action.</CardDescription></CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <Field>
                <FieldLabel id='settings-action-label' htmlFor='settings-action'>Account action</FieldLabel>
                <Select items={SETTINGS_ACTIONS} value={securityAction} onValueChange={(value) => { if (isSettingsAction(value)) setSecurityAction(value) }}>
                  <SelectTrigger id='settings-action' aria-labelledby='settings-action-label' aria-describedby='settings-action-description'><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup><SelectItem value='/2fa'>Two-factor authentication</SelectItem><SelectItem value='/dashboard'>Dashboard</SelectItem></SelectGroup></SelectContent>
                </Select>
                <FieldDescription id='settings-action-description'>Open the selected protected destination.</FieldDescription>
              </Field>
              <Button variant='outline' onClick={() => void navigate({ to: securityAction })}>Open destination</Button>
            </CardContent>
          </Card>
        </div>
        <Empty className='rounded-lg border bg-card'>
          <EmptyHeader><EmptyTitle>No connected accounts</EmptyTitle><EmptyDescription>No external identity providers are linked to this account.</EmptyDescription></EmptyHeader>
          <EmptyContent><Button variant='outline' render={<Link to='/dashboard' />} nativeButton={false}>Return to dashboard</Button></EmptyContent>
        </Empty>
        <Card className='border-destructive/30'>
          <CardHeader><CardTitle className='text-base text-destructive'>Danger zone</CardTitle><CardDescription>Delete your account and associated data.</CardDescription></CardHeader>
          <CardContent>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger render={<Button variant='destructive' />}>Delete account</DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Delete account?</DialogTitle><DialogDescription>This action cannot be undone. Confirm with your password.</DialogDescription></DialogHeader>
                {deleteError ? <Alert variant='destructive'><AlertTitle>Unable to delete</AlertTitle><AlertDescription id='settings-delete-password-error'>{deleteError}</AlertDescription></Alert> : null}
                <Field data-invalid={deleteError !== null}>
                  <FieldLabel htmlFor='settings-delete-password'>Password</FieldLabel>
                  <Input id='settings-delete-password' type='password' value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} aria-invalid={deleteError !== null} aria-describedby={deleteError ? 'settings-delete-password-error' : 'settings-delete-password-description'} aria-errormessage={deleteError ? 'settings-delete-password-error' : undefined} />
                  {!deleteError ? <FieldDescription id='settings-delete-password-description'>Your current password is required.</FieldDescription> : null}
                </Field>
                <DialogFooter><Button variant='outline' onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant='destructive' disabled={!deletePassword} onClick={() => void handleDelete()}>Confirm delete</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
`;
}

export function singleBillingRouteTanstackContent(): string {
  return [
    "import * as React from 'react'",
    "import { createFileRoute, redirect, Link } from '@tanstack/react-router'",
    "import { createServerFn } from '@tanstack/react-start'",
    "import { getRequestHeaders } from '@tanstack/react-start/server'",
    "import { auth } from '@/server/auth'",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Separator, Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/card'",
    "",
    "const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {",
    "  const headers = getRequestHeaders() as unknown as Headers",
    "  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<{ user?: { role?: string } } | null> } }).api.getSession({ headers })",
    "  return session ?? null",
    "})",
    "",
    "export const Route = createFileRoute('/billing')({",
    "  beforeLoad: async () => {",
    "    const session = await getSessionFn()",
    "    if (!session?.user) throw redirect({ to: '/sign-in' })",
    "    return { session }",
    "  },",
    "  component: BillingPage,",
    "})",
    "",
    "function BillingPage(): React.JSX.Element {",
    "  return (",
    "    <main className='min-h-screen bg-background p-6 md:p-8'>",
    "      <div className='mx-auto max-w-5xl flex flex-col gap-8'>",
    "        <div className='flex items-center justify-between gap-4'><div className='flex flex-col gap-2'><h1 className='text-2xl font-semibold tracking-tight'>Billing</h1><p className='text-sm text-muted-foreground max-w-[65ch]'>Flexible billing — any combo stripe, chargily EDAHABIA, paddle, polar. TanStack Start version.</p></div><Button size='sm' asChild><Link to='/dashboard'>Dashboard</Link></Button></div>",
    "        <Separator />",
    "        <Card><CardHeader><CardTitle className='text-base'>Subscriptions</CardTitle><CardDescription className='max-w-[60ch]'>Idempotent webhook handling, shared tables, oRPC contract-first. Flat src server/ + routes/ TanStack.</CardDescription></CardHeader><CardContent><Empty><EmptyHeader><EmptyTitle>No billing configured</EmptyTitle><EmptyDescription className='max-w-[60ch]'>Add a billing provider via ghostinit add billing. Stripe global, Chargily Algeria EDAHABIA/CIB, Paddle MoR 5%+50c, Polar metering.</EmptyDescription></EmptyHeader><EmptyContent><div className='flex gap-2'><Badge variant='secondary'><span className='flex items-center gap-1.5'><span className='size-1.5 rounded-full bg-primary' /> stripe</span></Badge><Badge variant='secondary'><span className='flex items-center gap-1.5'><span className='size-1.5 rounded-full bg-primary' /> chargily</span></Badge><Badge variant='secondary'>paddle</Badge><Badge variant='secondary'>polar</Badge></div></EmptyContent></Empty></CardContent></Card>",
    "      </div>",
    "    </main>",
    "  )",
    "}",
    "",
  ].join("\n");
}

export function singleNotFoundRouteTanstackContent(): string {
  return [
    "import * as React from 'react'",
    "import { createFileRoute, Link } from '@tanstack/react-router'",
    "import { Button } from '@/components/ui/button'",
    "import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'",
    "",
    "export const Route = createFileRoute('/$notFound')({ component: NotFoundPage })",
    "function NotFoundPage(): React.JSX.Element {",
    "  return (",
    "    <main className='min-h-screen bg-background flex items-center justify-center p-6'>",
    "      <Card className='w-full max-w-[420px] shadow-sm'>",
    "        <CardHeader><CardTitle className='text-2xl tracking-tight'>Page not found</CardTitle><CardDescription className='max-w-[60ch]'>The page you are looking for does not exist or was moved.</CardDescription></CardHeader>",
    "        <CardContent className='flex flex-col gap-3'><Button render={<Link to='/' />} nativeButton={false}>Back to home</Button></CardContent>",
    "      </Card>",
    "    </main>",
    "  )",
    "}",
    "",
  ].join("\n");
}
