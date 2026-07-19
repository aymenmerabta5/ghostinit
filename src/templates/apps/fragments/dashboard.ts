/**
 * Dashboard fragments – shared cards, settings layout, profile concepts
 * dashboardCards, settings cards shared between Next and TanStack
 */

export type RouterType = "next" | "tanstack";

export const sharedDashboardGrid = `        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Profile</CardTitle>
                <Badge variant="secondary" className="capitalize"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {session.user.role}</span></Badge>
              </div>
              <CardDescription className="max-w-[60ch]">Signed in as {session.user.email}. Name {session.user.name ?? "not set"}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><Link href="/settings">Edit profile</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/billing">Billing</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/admin">Admin</Link></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild><Link href="/settings">Security & 2FA</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/billing">Manage billing</Link></Button>
            </CardContent>
          </Card>
        </div>`;

export function dashboardInnerContent(router: RouterType): string {
  // Returns the inner JSX after auth check – shared between frameworks except Link syntax
  if (router === "tanstack") {
    return `        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild><Link to="/settings">Settings</Link></Button>
              <SignOutButton />
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Welcome back. Manage your account, billing, and modules.</p>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Profile</CardTitle>
                <Badge variant="secondary" className="capitalize"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {String(user?.role ?? 'user')}</span></Badge>
              </div>
              <CardDescription className="max-w-[60ch]">Signed in as {String(user?.email ?? '')}. Name {String(user?.name ?? 'not set')}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><Link to="/settings">Edit profile</Link></Button>
                <Button variant="outline" size="sm" asChild><Link to="/billing">Billing</Link></Button>
                <Button variant="outline" size="sm" asChild><Link to="/admin">Admin</Link></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild><Link to="/settings">Security & 2FA</Link></Button>
              <Button variant="outline" size="sm" asChild><Link to="/billing">Manage billing</Link></Button>
            </CardContent>
          </Card>
        </div>`;
  }
  return `        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/settings">Settings</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Welcome back. Manage your account, billing, and modules.</p>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Profile</CardTitle>
                <Badge variant="secondary" className="capitalize"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {session.user.role}</span></Badge>
              </div>
              <CardDescription className="max-w-[60ch]">Signed in as {session.user.email}. Name {session.user.name ?? "not set"}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><Link href="/settings">Edit profile</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/billing">Billing</Link></Button>
                <Button variant="outline" size="sm" asChild><Link href="/admin">Admin</Link></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild><Link href="/settings">Security & 2FA</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/billing">Manage billing</Link></Button>
            </CardContent>
          </Card>
        </div>`;
}

export function dashboardPageContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Separator } from '@repo/ui'
import { SignOutButton } from '../components/sign-out-button.js'

const getSessionFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  const session = await (auth as any).api.getSession({ headers })
  return session ?? null
})

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/sign-in' })
    }
    return { session }
  },
  component: DashboardPage,
})

function DashboardPage(): React.JSX.Element {
  const { session } = Route.useRouteContext() as any
  const user = session?.user

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8 lg:p-10">
${dashboardInnerContent("tanstack")}
      </div>
    </main>
  )
}
`;
  }
  return `import * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@repo/auth";
import { SignOutButton } from "../../components/sign-out-button.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Separator } from "@repo/ui";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/sign-in");
  }
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8 lg:p-10">
${dashboardInnerContent("next")}
      </div>
    </main>
  );
}
`;
}

export const sharedSettingsNav = [
  { label: "Settings", href: "/settings", to: "/settings" },
  { label: "Billing", href: "/billing", to: "/billing" },
  { label: "Admin", href: "/admin", to: "/admin" },
];
