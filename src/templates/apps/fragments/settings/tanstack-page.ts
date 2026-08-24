// @allow-long 340: one route owns six cohesive account settings sections and their shared auth boundary
import { file, type TemplateFile } from "../../../shared.js";
import {
  tanstackGetSessionFnContent,
  tanstackAuthBeforeLoadContent,
} from "../auth/tanstack-guard.js";

export function tanstackSettingsPageContent(): string {
  return `// @allow-long 320: six cohesive account settings sections share one protected TanStack route
import * as React from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { authClient } from '../lib/auth-client.js'
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const profileSchema = z.object({ name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be under 50") });
const passwordSchema = z.object({ currentPassword: z.string().min(1, "Current password required"), newPassword: z.string().min(8, "At least 8 characters").max(64) });
const totpSchema = z.object({ code: z.string().regex(/^[0-9]{6}$/, "Enter a 6-digit code") });

${tanstackGetSessionFnContent()}

export const Route = createFileRoute('/settings')({
  ${tanstackAuthBeforeLoadContent()}
  component: SettingsPage,
})

function ProfileSection(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: user?.name ?? "" } as { name: string },
    validators: { onSubmit: ({ value }) => { const p = profileSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(null);
      const parsed = profileSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid name"); return; }
      const result = await authClient.updateUser({ name: parsed.data.name });
      if (result.error) setError(result.error.message ?? "Failed to update profile");
      else setSuccess("Profile updated");
    },
  });
  React.useEffect(() => { if (user?.name) form.setFieldValue("name", user.name); }, [user?.name, form]);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Profile</CardTitle><CardDescription className="max-w-[60ch]">Update your display name. Email {String(user?.email ?? '')}. Role {String(user?.role ?? 'user')}.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Unable to update</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>Success</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
        <Form form={form} className="flex flex-col gap-4">
          <FieldGroup><TanStackField form={form} name="name" validators={{ onChange: ({ value }) => (value.trim().length < 2 ? "At least 2 characters" : undefined), onSubmit: ({ value }) => { const p = profileSchema.safeParse({ name: value }); return p.success ? undefined : p.error.issues[0]?.message; } }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="profile-name">Name</FieldLabel><Input id="profile-name" name={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Ada Lovelace" aria-invalid={field.state.meta.errors.length > 0} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your display name visible to workspace.</FieldDescription>)}</Field>)}</TanStackField></FieldGroup>
          <div className="flex items-center gap-2"><Badge variant="secondary">{String(user?.role ?? 'user')}</Badge><Badge variant="outline">{String(user?.email ?? '')}</Badge></div>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => <SubmitButton size="sm" disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon="inline-start" /> : null}{isSubmitting ? "Updating profile…" : "Update profile"}</SubmitButton>}
          </form.Subscribe>
        </Form>
      </CardContent>
    </Card>
  );
}

function PasswordSection(): React.JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "" } as { currentPassword: string; newPassword: string },
    validators: { onSubmit: ({ value }) => { const p = passwordSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(null);
      const parsed = passwordSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid password"); return; }
      const result = await authClient.changePassword({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword, revokeOtherSessions: true });
      if (result.error) setError(result.error.message ?? "Failed to update password");
      else { setSuccess("Password updated"); form.reset(); }
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Change password</CardTitle><CardDescription className="max-w-[60ch]">Use a strong password with at least 8 characters. Other sessions will be revoked.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Password error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>Updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
        <Form form={form} className="flex flex-col gap-4">
          <FieldGroup>
            <TanStackField form={form} name="currentPassword" validators={{ onChange: ({ value }) => (value.length < 1 ? "Required" : undefined), onSubmit: ({ value }) => (value.length < 1 ? "Current password required" : undefined) }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="current-password-tan">Current password</FieldLabel><Input id="current-password-tan" name={field.name} type="password" required autoComplete="current-password" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : null}</Field>)}</TanStackField>
            <TanStackField form={form} name="newPassword" validators={{ onChange: ({ value }) => (value.length > 0 && value.length < 8 ? "At least 8 characters" : undefined), onSubmit: ({ value }) => (value.length < 8 ? "Password must be at least 8" : undefined) }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="new-password-tan">New password</FieldLabel><Input id="new-password-tan" name={field.name} type="password" required minLength={8} autoComplete="new-password" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Must be at least 8 characters.</FieldDescription>)}</Field>)}</TanStackField>
          </FieldGroup>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => <SubmitButton disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon="inline-start" /> : null}{isSubmitting ? "Updating password…" : "Update password"}</SubmitButton>}
          </form.Subscribe>
        </Form>
      </CardContent>
    </Card>
  );
}

function TwoFactorSection(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const [totpUri, setTotpUri] = React.useState<string | null>(null);
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [optimisticEnabled, setOptimisticEnabled] = React.useState<boolean | null>(null);
  const enabled = optimisticEnabled ?? session?.user.twoFactorEnabled ?? false;
  const enableSchema = z.object({ password: z.string().min(1, "Password required") });
  const enableForm = useForm({
    defaultValues: { password: "" } as { password: string },
    validators: { onSubmit: ({ value }) => { const p = enableSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = enableSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid"); return; }
      const result = await authClient.twoFactor.enable({ password: parsed.data.password });
      if (result.error) { setError(result.error.message ?? "Failed to enable two-factor authentication"); return; }
      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes);
    },
  });
  const verifyForm = useForm({
    defaultValues: { code: "" } as { code: string },
    validators: { onSubmit: ({ value }) => { const p = totpSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = totpSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid code"); return; }
      const result = await authClient.twoFactor.verifyTotp({ code: parsed.data.code, trustDevice: true });
      if (result.error) { setError(result.error.message ?? "Invalid code"); return; }
      setOptimisticEnabled(true); setTotpUri(null); setBackupCodes(null); verifyForm.reset(); enableForm.reset();
    },
  });
  const disableForm = useForm({
    defaultValues: { password: "" } as { password: string },
    validators: { onSubmit: ({ value }) => { const p = enableSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = enableSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid"); return; }
      const result = await authClient.twoFactor.disable({ password: parsed.data.password });
      if (result.error) { setError(result.error.message ?? "Failed to disable two-factor authentication"); return; }
      setOptimisticEnabled(false); disableForm.reset();
    },
  });
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Two-factor authentication</CardTitle><Badge variant={enabled ? "secondary" : "outline"}><span className="flex items-center gap-1.5"><span className={enabled ? "size-1.5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground"} /> {enabled ? "enabled" : "disabled"}</span></Badge></div><CardDescription className="max-w-[65ch]">Secure your account with TOTP. Trust device 30 days, backup codes single-use.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>2FA error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {enabled ? (
          <Form form={disableForm} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground max-w-[65ch]">2FA is currently enabled for your account.</p>
            <FieldGroup><TanStackField form={disableForm} name="password" validators={{ onChange: ({ value }) => (value.length ? undefined : "Password required"), onSubmit: ({ value }) => (value.length ? undefined : "Password required") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="disable-2fa-tan">Password</FieldLabel><Input id="disable-2fa-tan" name={field.name} type="password" required value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(field.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField></FieldGroup>
            <disableForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
              {([canSubmit, isSubmitting]) => <SubmitButton variant="outline" disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon="inline-start" /> : null}{isSubmitting ? "Disabling 2FA…" : "Disable 2FA"}</SubmitButton>}
            </disableForm.Subscribe>
          </Form>
        ) : (
          <div className="flex flex-col gap-4">
            {!totpUri ? (
              <Form form={enableForm} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground max-w-[65ch]">Enable TOTP-based two-factor authentication.</p>
                <FieldGroup><TanStackField form={enableForm} name="password" validators={{ onChange: ({ value }) => (value.length ? undefined : "Password required"), onSubmit: ({ value }) => (value.length ? undefined : "Password required") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="enable-2fa-tan">Password</FieldLabel><Input id="enable-2fa-tan" name={field.name} type="password" required value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(field.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField></FieldGroup>
                <enableForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                  {([canSubmit, isSubmitting]) => <SubmitButton disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon="inline-start" /> : null}{isSubmitting ? "Preparing 2FA…" : "Enable 2FA"}</SubmitButton>}
                </enableForm.Subscribe>
              </Form>
            ) : (
              <Form form={verifyForm} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground max-w-[65ch]">Scan the TOTP URI in your authenticator app, then enter the code to verify.</p>
                <div className="break-all rounded-md bg-muted/40 border p-3 text-xs font-mono">{totpUri}</div>
                {backupCodes ? <div className="flex flex-col gap-2"><p className="text-sm font-medium">Backup codes</p><pre className="break-all rounded-md bg-muted/40 border p-3 text-xs font-mono whitespace-pre-wrap">{backupCodes.join("\\n")}</pre><p className="text-xs text-muted-foreground max-w-[60ch]">Store these securely. Each code can be used once.</p></div> : null}
                <FieldGroup><TanStackField form={verifyForm} name="code" validators={{ onChange: ({ value }) => (/^[0-9]{6}$/.test(value) ? undefined : "Enter a 6-digit code"), onSubmit: ({ value }) => (totpSchema.safeParse(value).success ? undefined : "Enter a 6-digit code") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="verify-code-tan">Verification code</FieldLabel><Input id="verify-code-tan" name={field.name} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/[^0-9]/g, "").slice(0,6))} onBlur={field.handleBlur} placeholder="000000" className="font-mono tracking-widest text-center" />{field.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(field.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField></FieldGroup>
                <verifyForm.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                  {([canSubmit, isSubmitting]) => <SubmitButton disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon="inline-start" /> : null}{isSubmitting ? "Verifying 2FA…" : "Verify and enable"}</SubmitButton>}
                </verifyForm.Subscribe>
              </Form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SessionsSection(): React.JSX.Element {
  type Session = { id: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string; expiresAt: string; isCurrent?: boolean };
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const refresh = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await (authClient as unknown as { listSessions: () => Promise<{ data?: Session[]; error?: { message?: string } }> }).listSessions?.();
      if (res?.error) { setError(res.error.message ?? "Failed to load sessions"); return; }
      if (res?.data) setSessions(res.data as Session[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const revoke = React.useCallback(async (id: string) => {
    setError(null);
    const res = await (authClient as unknown as { revokeSession: (opts: { id: string }) => Promise<{ error?: { message?: string } }> }).revokeSession?.({ id });
    if (res?.error) { setError(res.error.message ?? "Failed to revoke"); return; }
    await refresh();
  }, [refresh]);
  const revokeAll = React.useCallback(async () => {
    const res = await (authClient as unknown as { revokeSessions: () => Promise<{ error?: { message?: string } }> }).revokeSessions?.();
    if (res?.error) setError(res.error.message ?? "Failed"); else await refresh();
  }, [refresh]);
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-2"><CardTitle className="text-base">Active sessions</CardTitle><Badge variant="secondary">{sessions.length}</Badge></div><CardDescription className="max-w-[60ch]">Manage your active sessions. Revoke any session you don&apos;t recognize.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Sessions</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
          <Button size="sm" variant="destructive" onClick={() => void revokeAll()} disabled={sessions.length<=1}>Revoke others</Button>
        </div>
        <Separator />
        {loading ? <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading sessions">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3.5 w-16" /></div>)}</div> : sessions.length===0 ? <p className="text-sm text-muted-foreground">No other active sessions — this device only.</p> : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="font-mono text-xs truncate">{s.id.slice(0,8)}…{s.userAgent ?? "unknown device"}</span>
                  <span className="text-xs text-muted-foreground">{s.ipAddress ?? "no ip"} • expires {new Date(s.expiresAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.isCurrent ? <Badge variant="secondary">current</Badge> : null}
                  <Button size="sm" variant="outline" disabled={!!s.isCurrent} onClick={() => void revoke(s.id)}>Revoke</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DangerZoneSection(): React.JSX.Element {
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const deleteSchema = z.object({ confirm: z.literal("DELETE", { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) });
  const form = useForm({
    defaultValues: { confirm: "" } as { confirm: string },
    validators: { onSubmit: ({ value }) => { const p = deleteSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = deleteSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Type DELETE to confirm'); return; }
      const res = await (authClient as unknown as { deleteUser?: () => Promise<{ error?: { message?: string } }> }).deleteUser?.();
      if ((res as unknown as { error?: { message?: string } })?.error) setError((res as unknown as { error: { message?: string } }).error.message ?? "Failed");
      else { setOpen(false); window.location.href = "/"; }
    },
  });
  return (
    <Card className="border-destructive/30">
      <CardHeader><CardTitle className="text-base text-destructive">Danger zone</CardTitle><CardDescription className="max-w-[60ch]">Delete your account and all associated data. This action cannot be undone.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <Alert variant="destructive"><AlertTitle>Delete failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="destructive" />}>Delete account</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete account?</DialogTitle><DialogDescription>This permanently deletes your account and associated data.</DialogDescription></DialogHeader>
            <Form form={form} className="flex flex-col gap-3">
              <FieldGroup><TanStackField form={form} name="confirm" validators={{ onChange: ({ value }) => (value === "DELETE" ? undefined : 'Type DELETE to confirm'), onSubmit: ({ value }) => (value === "DELETE" ? undefined : 'Type DELETE to confirm') }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="danger-confirm">Type DELETE to confirm</FieldLabel><Input id="danger-confirm" name={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="DELETE" />{field.state.meta.errors.length ? (<FieldDescription className="text-destructive">{String(field.state.meta.errors[0])}</FieldDescription>) : null}</Field>)}</TanStackField></FieldGroup>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
                  {([canSubmit, isSubmitting]) => <SubmitButton variant="destructive" disabled={!canSubmit || isSubmitting}>{isSubmitting ? <Spinner data-icon="inline-start" /> : null}{isSubmitting ? "Deleting account…" : "Confirm delete"}</SubmitButton>}
                </form.Subscribe>
              </DialogFooter>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function SettingsPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Manage account, security, sessions and workspace preferences.</p>
        </div>
        <Separator />
        <div className="flex flex-col gap-6 max-w-2xl">
          <ProfileSection />
          <PasswordSection />
          <TwoFactorSection />
          <SessionsSection />
          <DangerZoneSection />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" render={<Link to="/dashboard" />} nativeButton={false}>Dashboard</Button>
            <Button variant="outline" size="sm" render={<Link to="/billing" />} nativeButton={false}>Billing</Button>
          </div>
        </div>
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
