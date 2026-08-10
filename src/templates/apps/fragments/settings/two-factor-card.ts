import { file, type TemplateFile } from "../../../shared.js";
export function settingsTwoFactorCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/two-factor-card.tsx",
    `"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";
import { z } from "zod";
const passwordSchema = z.object({ password: z.string().min(1, "Password required") });
const totpSchema = z.object({ code: z.string().regex(/^[0-9]{6}$/, "Enter a 6-digit code") });
export function TwoFactorCard(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  type SessionUser = { twoFactorEnabled?: boolean | null };
  const user = session?.user as unknown as SessionUser | undefined;
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serverEnabled = user?.twoFactorEnabled ?? false;
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const enabled = optimisticEnabled ?? serverEnabled;
  useEffect(() => { if (optimisticEnabled !== null && optimisticEnabled === serverEnabled) setOptimisticEnabled(null); }, [optimisticEnabled, serverEnabled]);
  const enableForm = useForm({ defaultValues: { password: "" } as { password: string }, validators: { onSubmit: ({ value }) => { const p = passwordSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } }, onSubmit: async ({ value }) => { setError(null); const parsed = passwordSchema.safeParse(value); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid"); return; } const result = await authClient.twoFactor.enable({ password: parsed.data.password }); if (result.error) { setError(result.error.message ?? "Failed to enable 2FA"); return; } type EnableData = { totpURI?: string | null; backupCodes?: string[] | string | null }; const data = result.data as unknown as EnableData | null; setTotpUri(data?.totpURI ? String(data.totpURI) : null); setBackupCodes(data?.backupCodes ? String(data.backupCodes) : null); } });
  const verifyForm = useForm({ defaultValues: { code: "" } as { code: string }, validators: { onSubmit: ({ value }) => { const p = totpSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } }, onSubmit: async ({ value }) => { setError(null); const parsed = totpSchema.safeParse(value); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid code"); return; } const result = await authClient.twoFactor.verifyTotp({ code: parsed.data.code, trustDevice: true }); if (result.error) { setError(result.error.message ?? "Invalid code"); return; } setOptimisticEnabled(true); setTotpUri(null); setBackupCodes(null); verifyForm.reset(); enableForm.reset(); } });
  const disableForm = useForm({ defaultValues: { password: "" } as { password: string }, validators: { onSubmit: ({ value }) => { const p = passwordSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } }, onSubmit: async ({ value }) => { setError(null); const parsed = passwordSchema.safeParse(value); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid"); return; } const result = await authClient.twoFactor.disable({ password: parsed.data.password }); if (result.error) { setError(result.error.message ?? "Failed to disable 2FA"); return; } setOptimisticEnabled(false); disableForm.reset(); } });
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Two-factor authentication</CardTitle><Badge variant={enabled ? "secondary" : "outline"}><span className="flex items-center gap-1.5"><span className={enabled ? "size-1.5 rounded-full bg-primary" : "size-1.5 rounded-full bg-muted-foreground"} /> {enabled ? "enabled" : "disabled"}</span></Badge></div>
        <CardDescription className="max-w-[65ch]">Secure your account with TOTP. Trust device 30 days, backup codes single-use.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>2FA error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {enabled ? (
          <Form form={disableForm} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground max-w-[65ch]">2FA is currently enabled for your account.</p>
            <FieldGroup><TanStackField form={disableForm} name="password" validators={{ onSubmit: ({ value }) => (value.length < 1 ? "Password required" : undefined) }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="disable-2fa-password">Password</FieldLabel><Input id="disable-2fa-password" name={field.name} type="password" required value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-invalid={field.state.meta.errors.length > 0} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : null}</Field>)}</TanStackField></FieldGroup>
            <SubmitButton variant="outline">Disable 2FA</SubmitButton>
          </Form>
        ) : (
          <div className="flex flex-col gap-4">
            {!totpUri ? (
              <Form form={enableForm} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground max-w-[65ch]">Enable TOTP-based two-factor authentication.</p>
                <FieldGroup><TanStackField form={enableForm} name="password" validators={{ onSubmit: ({ value }) => (value.length < 1 ? "Password required" : undefined) }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="enable-2fa-password">Password</FieldLabel><Input id="enable-2fa-password" name={field.name} type="password" required value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-invalid={field.state.meta.errors.length > 0} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : null}</Field>)}</TanStackField></FieldGroup>
                <SubmitButton>Enable 2FA</SubmitButton>
              </Form>
            ) : (
              <Form form={verifyForm} className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground max-w-[65ch]">Scan the TOTP URI in your authenticator app, then enter the code to verify.</p>
                <div className="break-all rounded-md bg-muted/40 border p-3 text-xs font-mono">{totpUri}</div>
                {backupCodes ? <div className="flex flex-col gap-2"><p className="text-sm font-medium">Backup codes</p><pre className="break-all rounded-md bg-muted/40 border p-3 text-xs font-mono whitespace-pre-wrap">{backupCodes}</pre><p className="text-xs text-muted-foreground max-w-[60ch]">Store these securely. Each code can be used once.</p></div> : null}
                <FieldGroup><TanStackField form={verifyForm} name="code" validators={{ onSubmit: ({ value }) => (/^[0-9]{6}$/.test(value) ? undefined : "Enter a 6-digit code") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="verify-code">Verification code</FieldLabel><Input id="verify-code" name={field.name} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} onBlur={field.handleBlur} placeholder="000000" className="font-mono tracking-widest text-center" aria-invalid={field.state.meta.errors.length > 0} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>6-digit code from authenticator.</FieldDescription>)}</Field>)}</TanStackField></FieldGroup>
                <SubmitButton>Verify and enable</SubmitButton>
              </Form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
`,
  );
}
