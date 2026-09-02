import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";
import type { DesktopMode } from "../model.js";

export function desktopRouteTwoFactorContent(
  hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(hasI18n, "settings", nativeI18nImportPath("desktop", mode));
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { useAuth } from "../hooks/useAuth";
import { authClient } from "../lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
${i18n.importLine}

export const Route = createFileRoute("/2fa")({
  component: TwoFactorPage,
});

function TwoFactorPage() {
${i18n.hookLine}
  const { user } = useAuth();
  const [totpUri, setTotpUri] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const enabled = Boolean(user?.twoFactorEnabled);
  const passwordSchema = z.object({ password: z.string().min(8, ${i18n.value("validation.passwordTooShort", "Password must be at least 8 characters")}) });
  const codeSchema = z.object({ code: z.string().regex(/^[0-9]{6}$/, ${i18n.value("validation.codeSixDigits", "Enter a 6-digit code")}) });
  const passwordForm = useForm({
    defaultValues: { password: "" } as { password: string },
    validators: { onSubmit: ({ value }) => { const p = passwordSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message } },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(null);
      const parsed = passwordSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("twoFactor.genericError", "Invalid")}); return; }
      const res = await authClient.twoFactor.enable({ password: parsed.data.password });
      if (res.error) { setError(${hasI18n ? 't("twoFactor.genericError")' : 'res.error.message ?? "Failed"'}); return; }
      setTotpUri(String((res.data as { totpURI?: string })?.totpURI ?? ""));
      setSuccess(${i18n.value("twoFactor.scanDescription", "Scan TOTP URI then verify")});
    },
  });
  const codeForm = useForm({
    defaultValues: { code: "" } as { code: string },
    validators: { onSubmit: ({ value }) => { const p = codeSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = codeSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("twoFactor.genericError", "Invalid")}); return; }
      const res = await authClient.twoFactor.verifyTotp({ code: parsed.data.code, trustDevice: true });
      if (res.error) setError(${hasI18n ? 't("errors.invalidCode")' : 'res.error.message ?? "Invalid code"'}); else setSuccess(${i18n.value("twoFactor.enabledDescription", "2FA enabled")});
    },
  });
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("twoFactor.title", "Two-factor authentication")}</h1>
      <p className="text-sm text-muted-foreground">${i18n.child("twoFactor.description", "Secure your account with TOTP.")}</p>
      <Separator />
      {error ? <Alert variant="destructive" aria-live="assertive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert role="status" aria-live="polite"><AlertDescription>{success}</AlertDescription></Alert> : null}
      <div className="flex items-center gap-2"><span className="text-sm font-medium">${i18n.child("twoFactor.statusLabel", "Status:")}</span><Badge variant={enabled ? "secondary" : "outline"}>{enabled ? ${i18n.value("twoFactor.enabled", "enabled")} : ${i18n.value("twoFactor.disabled", "disabled")}}</Badge></div>
      {!enabled && !totpUri ? (
        <form onSubmit={(e) => { e.preventDefault(); void passwordForm.handleSubmit(); }} className="flex flex-col gap-3">
          <passwordForm.Field name="password" validators={{ onChange: ({ value }) => (value.length >= 8 ? undefined : ${i18n.value("validation.passwordTooShort", "Password must be at least 8 characters")}) }}>{(field) => { const passwordError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(passwordError)}><FieldLabel htmlFor="two-factor-password">${i18n.child("twoFactor.passwordLabel", "Password")}</FieldLabel><Input id="two-factor-password" name={field.name} type="password" required autoComplete="current-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-describedby="two-factor-password-description" aria-errormessage={passwordError ? "two-factor-password-error" : undefined} aria-invalid={Boolean(passwordError)} /><FieldDescription id="two-factor-password-description">${i18n.child("twoFactor.passwordDescription", "Confirm your account password before creating a TOTP secret.")}</FieldDescription><FieldError id="two-factor-password-error">{passwordError}</FieldError></Field>); }}</passwordForm.Field>
          <Button type="submit">${i18n.child("twoFactor.enable", "Enable 2FA")}</Button>
        </form>
      ) : totpUri ? (
        <form onSubmit={(e) => { e.preventDefault(); void codeForm.handleSubmit(); }} className="flex flex-col gap-3"><Field><FieldLabel htmlFor="two-factor-setup-uri">${i18n.child("twoFactor.setupUriLabel", "TOTP setup URI")}</FieldLabel><Input id="two-factor-setup-uri" readOnly value={totpUri} className="font-mono text-xs" aria-describedby="two-factor-setup-uri-description" aria-errormessage="two-factor-setup-uri-error" aria-invalid={false} /><FieldDescription id="two-factor-setup-uri-description">${i18n.child("twoFactor.scanDescription", "Scan this URI with your authenticator app.")}</FieldDescription><FieldError id="two-factor-setup-uri-error">{null}</FieldError></Field>
          <codeForm.Field name="code" validators={{ onChange: ({ value }) => (/^[0-9]{6}$/.test(value) ? undefined : ${i18n.value("validation.codeSixDigits", "Enter a 6-digit code")}) }}>{(field) => { const codeError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(codeError)}><FieldLabel htmlFor="two-factor-code">${i18n.child("twoFactor.codeLabel", "Authentication code")}</FieldLabel><Input id="two-factor-code" name={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/[^0-9]/g, "").slice(0,6))} onBlur={field.handleBlur} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="font-mono tracking-widest text-center" aria-describedby="two-factor-code-description" aria-errormessage={codeError ? "two-factor-code-error" : undefined} aria-invalid={Boolean(codeError)} /><FieldDescription id="two-factor-code-description">${i18n.child("twoFactor.codeDescription", "Enter the current six-digit code from your authenticator app.")}</FieldDescription><FieldError id="two-factor-code-error">{codeError}</FieldError></Field>); }}</codeForm.Field>
          <Button type="submit">${i18n.child("twoFactor.verify", "Verify")}</Button>
        </form>
      ) : <Alert role="status"><AlertDescription>${i18n.child("twoFactor.enabledDescription", "2FA is enabled.")}</AlertDescription></Alert>}
      <Button render={<Link to="/settings" />} nativeButton={false} variant="outline">${i18n.child("twoFactor.backSettings", "Back to settings")}</Button>
    </main>
  );
}
`;
}
