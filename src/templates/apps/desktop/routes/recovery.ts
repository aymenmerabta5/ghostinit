import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";
import type { DesktopMode } from "../model.js";

export function desktopRouteForgotPasswordContent(
  hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(hasI18n, "recovery", nativeI18nImportPath("desktop", mode));
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { authClient } from "../lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
${i18n.importLine}

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
${i18n.hookLine}
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const forgotSchema = z.object({ email: z.string().email(${i18n.value("forgotPassword.invalidEmail", "Enter a valid email")}) });
  const form = useForm({
    defaultValues: { email: "" } as { email: string },
    validators: { onSubmit: ({ value }) => { const p = forgotSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = forgotSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("forgotPassword.invalidEmail", "Invalid")}); return; }
      const res = await authClient.requestPasswordReset({ email: parsed.data.email, redirectTo: "/reset-password" });
      if (res.error) setError(${hasI18n ? 't("forgotPassword.genericError")' : 'res.error.message ?? "Failed"'}); else setDone(true);
    },
  });
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("forgotPassword.title", "Forgot password")}</h1>
      <p className="text-sm text-muted-foreground">${i18n.child("forgotPassword.description", "Enter your email to receive a reset link.")}</p>
      <Separator />
      {done ? <Alert role="status"><AlertDescription>${i18n.child("forgotPassword.successMessage", "If an account exists, a reset email was sent.")}</AlertDescription></Alert> : (
        <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }} className="flex flex-col gap-3">
          {error ? <Alert variant="destructive" aria-live="assertive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <form.Field name="email" validators={{ onChange: ({ value }) => (!/\\S+@\\S+\\.\\S+/.test(value) ? ${i18n.value("forgotPassword.invalidEmail", "Enter a valid email")} : undefined) }}>{(field) => { const emailError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(emailError)}><FieldLabel htmlFor="forgot-email">${i18n.child("forgotPassword.emailLabel", "Email")}</FieldLabel><Input id="forgot-email" name={field.name} type="email" required autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={${i18n.value("forgotPassword.emailPlaceholder", "you@example.com")}} aria-describedby="forgot-email-description" aria-errormessage={emailError ? "forgot-email-error" : undefined} aria-invalid={Boolean(emailError)} /><FieldDescription id="forgot-email-description">${i18n.child("forgotPassword.emailDescription", "We send a reset link only when this address belongs to an account.")}</FieldDescription><FieldError id="forgot-email-error">{emailError}</FieldError></Field>); }}</form.Field>
          <Button type="submit">${i18n.child("forgotPassword.submit", "Send reset link")}</Button>
        </form>
      )}
      <Button render={<Link to="/" />} nativeButton={false} variant="outline">${i18n.child("forgotPassword.backHome", "Back to home")}</Button>
    </main>
  );
}
`;
}

export function desktopRouteResetPasswordContent(
  hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(hasI18n, "recovery", nativeI18nImportPath("desktop", mode));
  return `import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { authClient } from "../lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
${i18n.importLine}

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
${i18n.hookLine}
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const resetSchema = z.object({ newPassword: z.string().min(8, ${i18n.value("resetPassword.passwordTooShort", "At least 8 characters")}).max(64, ${i18n.value("resetPassword.passwordTooLong", "Password must be 64 characters or fewer")}), confirmPassword: z.string().min(8, ${i18n.value("resetPassword.passwordTooShort", "At least 8 characters")}) }).refine((d) => d.newPassword === d.confirmPassword, { message: ${i18n.value("resetPassword.passwordMismatch", "Passwords do not match")}, path: ["confirmPassword"] });
  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" } as { newPassword: string; confirmPassword: string },
    validators: { onSubmit: ({ value }) => { const p = resetSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = resetSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("resetPassword.genericError", "Invalid")}); return; }
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      const res = await authClient.resetPassword({ newPassword: parsed.data.newPassword, token });
      if (res.error) setError(${hasI18n ? 't("resetPassword.genericError")' : 'res.error.message ?? "Failed"'}); else setDone(true);
    },
  });
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("resetPassword.title", "Reset password")}</h1>
      <p className="text-sm text-muted-foreground">${i18n.child("resetPassword.description", "Enter your new password (at least 8 characters).")}</p>
      <Separator />
      {done ? <Alert role="status"><AlertDescription>${i18n.child("resetPassword.successMessage", "Password reset. You can now sign in.")}</AlertDescription></Alert> : (
        <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }} className="flex flex-col gap-3">
          {error ? <Alert variant="destructive" aria-live="assertive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <form.Field name="newPassword" validators={{ onChange: ({ value }) => (value.length>0 && value.length<8 ? ${i18n.value("resetPassword.passwordTooShort", "At least 8")} : undefined) }}>{(field) => { const passwordError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(passwordError)}><FieldLabel htmlFor="reset-password">${i18n.child("resetPassword.newPasswordLabel", "New password")}</FieldLabel><Input id="reset-password" name={field.name} type="password" required minLength={8} autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-describedby="reset-password-description" aria-errormessage={passwordError ? "reset-password-error" : undefined} aria-invalid={Boolean(passwordError)} /><FieldDescription id="reset-password-description">${i18n.child("resetPassword.newPasswordDescription", "Use at least eight characters.")}</FieldDescription><FieldError id="reset-password-error">{passwordError}</FieldError></Field>); }}</form.Field>
          <form.Field name="confirmPassword" validators={{ onSubmit: ({ value, fieldApi }) => { const pw = fieldApi.form.getFieldValue("newPassword"); return value !== pw ? ${i18n.value("resetPassword.passwordMismatch", "Passwords do not match")} : undefined; } }}>{(field) => { const confirmError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(confirmError)}><FieldLabel htmlFor="reset-password-confirmation">${i18n.child("resetPassword.confirmPasswordLabel", "Confirm password")}</FieldLabel><Input id="reset-password-confirmation" name={field.name} type="password" required autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-describedby="reset-password-confirmation-description" aria-errormessage={confirmError ? "reset-password-confirmation-error" : undefined} aria-invalid={Boolean(confirmError)} /><FieldDescription id="reset-password-confirmation-description">${i18n.child("resetPassword.confirmPasswordDescription", "Re-enter the same new password.")}</FieldDescription><FieldError id="reset-password-confirmation-error">{confirmError}</FieldError></Field>); }}</form.Field>
          <Button type="submit">${i18n.child("resetPassword.submit", "Reset password")}</Button>
        </form>
      )}
    </main>
  );
}
`;
}
