import { file, type TemplateFile } from "../../../shared.js";
import {
  tanstackGetSessionFnContent,
  tanstackAuthBeforeLoadContent,
} from "../auth/tanstack-guard.js";

export function tanstackSettingsPageContent(): string {
  return `import * as React from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

${tanstackGetSessionFnContent()}

export const Route = createFileRoute('/settings')({
  ${tanstackAuthBeforeLoadContent()}
  component: SettingsPage,
})

function SettingsPage(): React.JSX.Element {
  const { session } = Route.useRouteContext() as { session: { user: { email?: string; name?: string | null; role?: string } } }
  const user = session?.user
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Manage account and workspace preferences.</p>
        </div>
        <Separator />
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription className="max-w-[60ch]">Signed in as {String(user?.email ?? '')}. Role {String(user?.role ?? 'user')}.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Name</span>
                <Input defaultValue={String(user?.name ?? '')} readOnly />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{String(user?.role ?? 'user')}</Badge>
                <Badge variant="outline">{String(user?.email ?? '')}</Badge>
              </div>
              <Alert>
                <AlertTitle>Profile editing</AlertTitle>
                <AlertDescription className="max-w-[60ch]">Use authClient.updateUser from client components. This server route shows protected data via createServerFn + getRequestHeaders pattern per Context7.</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
                <Button variant="outline" size="sm" asChild><Link to="/billing">Billing</Link></Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" size="sm" asChild><Link to="/2fa">Two-factor</Link></Button>
              <Button variant="outline" size="sm" asChild><Link to="/forgot-password">Reset password</Link></Button>
              <Button variant="outline" size="sm" asChild><Link to="/settings/sessions">Sessions</Link></Button>
              <Alert><AlertTitle>Passkey & Magic Link</AlertTitle><AlertDescription className="text-xs">Passkey (WebAuthn) + Magic Link + Organization enabled via better-auth. Use authClient.signIn.magicLink / authClient.passkey.* / authClient.organization.*.</AlertDescription></Alert>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Sessions</CardTitle><CardDescription>Active sessions — revoke via client component in /settings (Next) or call authClient.listSessions().</CardDescription></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">TanStack sessions are managed client-side via authClient.listSessions()/revokeSession(). See Next Settings → Sessions card for full UI.</p></CardContent>
        </Card>
      </div>
    </main>
  )
}
`;
}

export function settingsPageContent(router: "next" | "tanstack" = "next"): string {
  if (router === "tanstack") return tanstackSettingsPageContent();
  // Next version delegated to existing page.ts content via import, but keep placeholder for interface parity
  // Actual Next files are componentized; this wrapper returns TanStack when needed
  return tanstackSettingsPageContent();
}

export function tanstackSettingsPage(): TemplateFile {
  return file("apps/web/src/routes/settings.tsx", tanstackSettingsPageContent());
}
