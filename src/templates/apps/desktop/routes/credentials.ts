import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";
import type { DesktopMode } from "../model.js";

export function desktopRouteSignInContent(
  hasEmail = true,
  hasI18n = false,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth", nativeI18nImportPath("desktop", mode));
  if (!hasEmail) {
    return `import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { identityClient, type IdentityOAuthProvider } from "../lib/auth";
${i18n.importLine}

export const Route = createFileRoute("/sign-in")({ component: SignInPage });

function SignInPage(): React.JSX.Element {
${i18n.hookLine}
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<IdentityOAuthProvider | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  async function signInWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signIn.genericError", "Sign in failed")}); return; }
      await navigate({ to: "/dashboard" });
    } catch { setError(${i18n.value("signIn.genericError", "Sign in failed")}); }
    finally { setPending(null); }
  }
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("signIn.title", "Sign in")}</h1>
      <p className="text-sm text-muted-foreground">${i18n.child("signIn.emailDisabled", "Email/password sign-in is unavailable. Continue with a configured OAuth provider.")}</p>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-3"><Button variant="outline" disabled={pending !== null} onClick={() => void signInWithOAuth("google")}>{pending === "google" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGoogle", "Continue with Google")}}</Button><Button variant="outline" disabled={pending !== null} onClick={() => void signInWithOAuth("github")}>{pending === "github" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGitHub", "Continue with GitHub")}}</Button></div>
      <Button render={<Link to="/" />} nativeButton={false} variant="outline">${i18n.child("signIn.backHome", "Back to home")}</Button>
    </main>
  );
}
`;
  }
  const emailLinks = hasEmail
    ? `<Button render={<Link to="/forgot-password" />} nativeButton={false} size="sm" variant="outline">${i18n.child("signIn.forgotPassword", "Forgot password")}</Button><Button render={<Link to="/magic-link" />} nativeButton={false} size="sm" variant="outline">${i18n.child("signIn.magicLink", "Magic link")}</Button><Button render={<Link to="/verify-email" />} nativeButton={false} size="sm" variant="outline">${i18n.child("signIn.verifyEmail", "Verify email")}</Button>`
    : "";
  return `import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { identityClient, type IdentityOAuthProvider } from "../lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
${i18n.importLine}

function requiresTwoFactor(data: unknown): boolean {
  return typeof data === "object" && data !== null && Reflect.get(data, "twoFactorRedirect") === true;
}

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});

function SignInPage() {
${i18n.hookLine}
  const [error, setError] = React.useState<string | null>(null);
  const [oauthPending, setOauthPending] = React.useState<IdentityOAuthProvider | null>(null);
  const [credentialPending, setCredentialPending] = React.useState(false);
  const navigate = useNavigate();
  const signInSchema = z.object({ email: z.string().email(${i18n.value("validation.invalidEmail", "Enter a valid email")}), password: z.string().min(8, ${i18n.value("validation.passwordTooShort", "Password must be at least 8")}).max(64, ${i18n.value("validation.passwordTooLong", "Password must be 64 characters or fewer")}) });
  const form = useForm({
    defaultValues: { email: "", password: "" } as { email: string; password: string },
    validators: { onSubmit: ({ value }) => { const p = signInSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = signInSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("signIn.invalidInput", "Invalid")}); return; }
      setCredentialPending(true);
      try {
        const res = await identityClient.signInWithEmail({ email: parsed.data.email, password: parsed.data.password, callbackURL: "/dashboard" });
        if (res.error) setError(${i18n.value("signIn.genericError", "Sign in failed")});
        else await navigate({ to: requiresTwoFactor(res.data) ? "/2fa" : "/dashboard" });
      } catch { setError(${i18n.value("signIn.genericError", "Sign in failed")}); }
      finally { setCredentialPending(false); }
    },
  });
  async function signInWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setOauthPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signIn.genericError", "Sign in failed")}); return; }
      await navigate({ to: "/dashboard" });
    } catch { setError(${i18n.value("signIn.genericError", "Sign in failed")}); }
    finally { setOauthPending(null); }
  }
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("signIn.title", "Sign in")}</h1>
      <div className="grid gap-3"><Button variant="outline" disabled={credentialPending || oauthPending !== null} onClick={() => void signInWithOAuth("google")}>{oauthPending === "google" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGoogle", "Continue with Google")}}</Button><Button variant="outline" disabled={credentialPending || oauthPending !== null} onClick={() => void signInWithOAuth("github")}>{oauthPending === "github" ? ${i18n.value("signIn.oauthPending", "Opening…")} : ${i18n.value("signIn.oauthGitHub", "Continue with GitHub")}}</Button></div>
      <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }} className="flex flex-col gap-3">
        {error ? <Alert variant="destructive" aria-live="assertive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form.Field name="email" validators={{ onChange: ({ value }) => (!/\\S+@\\S+\\.\\S+/.test(value) ? ${i18n.value("validation.invalidEmail", "Enter a valid email")} : undefined) }}>{(field) => { const emailError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(emailError)}><FieldLabel htmlFor="sign-in-email">${i18n.child("signIn.emailLabel", "Email")}</FieldLabel><Input id="sign-in-email" name={field.name} type="email" required autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={${i18n.value("signIn.emailPlaceholder", "you@example.com")}} aria-describedby="sign-in-email-description" aria-errormessage={emailError ? "sign-in-email-error" : undefined} aria-invalid={Boolean(emailError)} /><FieldDescription id="sign-in-email-description">${i18n.child("signIn.emailDescription", "Use the email address linked to your account.")}</FieldDescription><FieldError id="sign-in-email-error">{emailError}</FieldError></Field>); }}</form.Field>
        <form.Field name="password" validators={{ onChange: ({ value }) => (value.length>0 && value.length<8 ? ${i18n.value("validation.passwordTooShort", "At least 8")} : value.length > 64 ? ${i18n.value("validation.passwordTooLong", "Password must be 64 characters or fewer")} : undefined) }}>{(field) => { const passwordError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(passwordError)}><FieldLabel htmlFor="sign-in-password">${i18n.child("signIn.passwordLabel", "Password")}</FieldLabel><Input id="sign-in-password" name={field.name} type="password" required maxLength={64} autoComplete="current-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-describedby="sign-in-password-description" aria-errormessage={passwordError ? "sign-in-password-error" : undefined} aria-invalid={Boolean(passwordError)} /><FieldDescription id="sign-in-password-description">${i18n.child("signIn.passwordDescription", "Enter your current account password.")}</FieldDescription><FieldError id="sign-in-password-error">{passwordError}</FieldError></Field>); }}</form.Field>
        <Button type="submit" loading={credentialPending} disabled={credentialPending || oauthPending !== null}>${i18n.child("signIn.submit", "Sign in")}</Button>
      </form>
      <div className="flex flex-wrap items-center gap-3 text-sm">${emailLinks}<span>${i18n.child("signIn.createAccountPrompt", "Don't have an account?")}</span><Button render={<Link to="/sign-up" />} nativeButton={false} size="sm" variant="outline">${i18n.child("signIn.createAccountLink", "Sign up")}</Button></div>
    </main>
  );
}
`;
}

export function desktopRouteSignUpContent(
  hasI18n = false,
  mode: DesktopMode = "monorepo",
  hasEmail = true,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "auth", nativeI18nImportPath("desktop", mode));
  if (!hasEmail) {
    return `import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { identityClient, type IdentityOAuthProvider } from "../lib/auth";
${i18n.importLine}

export const Route = createFileRoute("/sign-up")({ component: SignUpPage });

function SignUpPage(): React.JSX.Element {
${i18n.hookLine}
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<IdentityOAuthProvider | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  async function signUpWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signUp.genericError", "Account creation failed")}); return; }
      await navigate({ to: "/dashboard" });
    } catch { setError(${i18n.value("signUp.genericError", "Account creation failed")}); }
    finally { setPending(null); }
  }
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("signUp.title", "Create account")}</h1>
      <p className="text-sm text-muted-foreground">${i18n.child("signUp.emailDisabled", "Password signup is unavailable. Continue with a configured OAuth provider.")}</p>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="grid gap-3"><Button variant="outline" disabled={pending !== null} onClick={() => void signUpWithOAuth("google")}>{pending === "google" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGoogle", "Continue with Google")}}</Button><Button variant="outline" disabled={pending !== null} onClick={() => void signUpWithOAuth("github")}>{pending === "github" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGitHub", "Continue with GitHub")}}</Button></div>
      <Button render={<Link to="/sign-in" />} nativeButton={false} variant="outline">${i18n.child("signUp.signInLink", "Sign in")}</Button>
    </main>
  );
}
`;
  }
  return `import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { identityClient, type IdentityOAuthProvider } from "../lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
${i18n.importLine}

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
${i18n.hookLine}
  const [error, setError] = React.useState<string | null>(null);
  const [oauthPending, setOauthPending] = React.useState<IdentityOAuthProvider | null>(null);
  const [credentialPending, setCredentialPending] = React.useState(false);
  const navigate = useNavigate();
  const signUpSchema = z.object({ name: z.string().min(2, ${i18n.value("validation.nameTooShort", "Name at least 2")}).max(50, ${i18n.value("validation.nameTooLong", "Name must be 50 characters or fewer")}), email: z.string().email(${i18n.value("validation.invalidEmail", "Enter a valid email")}), password: z.string().min(8, ${i18n.value("validation.passwordTooShort", "Password at least 8")}).max(64, ${i18n.value("validation.passwordTooLong", "Password must be 64 characters or fewer")}) });
  const form = useForm({
    defaultValues: { name: "", email: "", password: "" } as { name: string; email: string; password: string },
    validators: { onSubmit: ({ value }) => { const p = signUpSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = signUpSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? ${i18n.value("signUp.invalidInput", "Invalid")}); return; }
      setCredentialPending(true);
      try {
        const res = await identityClient.signUpWithEmail({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, callbackURL: "/dashboard" });
        if (res.error) setError(${i18n.value("signUp.genericError", "Sign up failed")}); else await navigate({ to: "/dashboard" });
      } catch { setError(${i18n.value("signUp.genericError", "Sign up failed")}); }
      finally { setCredentialPending(false); }
    },
  });
  async function signUpWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null); setOauthPending(provider);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) { setError(${i18n.value("signUp.genericError", "Sign up failed")}); return; }
      await navigate({ to: "/dashboard" });
    } catch { setError(${i18n.value("signUp.genericError", "Sign up failed")}); }
    finally { setOauthPending(null); }
  }
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("signUp.title", "Create account")}</h1>
      <div className="grid gap-3"><Button variant="outline" disabled={credentialPending || oauthPending !== null} onClick={() => void signUpWithOAuth("google")}>{oauthPending === "google" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGoogle", "Continue with Google")}}</Button><Button variant="outline" disabled={credentialPending || oauthPending !== null} onClick={() => void signUpWithOAuth("github")}>{oauthPending === "github" ? ${i18n.value("signUp.oauthPending", "Opening…")} : ${i18n.value("signUp.oauthGitHub", "Continue with GitHub")}}</Button></div>
      <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }} className="flex flex-col gap-3">
        {error ? <Alert variant="destructive" aria-live="assertive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form.Field name="name" validators={{ onChange: ({ value }) => (value.trim().length>0 && value.trim().length<2 ? ${i18n.value("validation.nameTooShort", "At least 2")} : value.trim().length > 50 ? ${i18n.value("validation.nameTooLong", "Name must be 50 characters or fewer")} : undefined) }}>{(field) => { const nameError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(nameError)}><FieldLabel htmlFor="sign-up-name">${i18n.child("signUp.nameLabel", "Name")}</FieldLabel><Input id="sign-up-name" name={field.name} required maxLength={50} autoComplete="name" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={${i18n.value("signUp.namePlaceholder", "Ada Lovelace")}} aria-describedby="sign-up-name-description" aria-errormessage={nameError ? "sign-up-name-error" : undefined} aria-invalid={Boolean(nameError)} /><FieldDescription id="sign-up-name-description">${i18n.child("signUp.nameDescription", "Use the name teammates should see.")}</FieldDescription><FieldError id="sign-up-name-error">{nameError}</FieldError></Field>); }}</form.Field>
        <form.Field name="email" validators={{ onChange: ({ value }) => (!/\\S+@\\S+\\.\\S+/.test(value) ? ${i18n.value("validation.invalidEmail", "Enter a valid email")} : undefined) }}>{(field) => { const emailError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(emailError)}><FieldLabel htmlFor="sign-up-email">${i18n.child("signUp.emailLabel", "Email")}</FieldLabel><Input id="sign-up-email" name={field.name} type="email" required autoComplete="email" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder={${i18n.value("signUp.emailPlaceholder", "you@example.com")}} aria-describedby="sign-up-email-description" aria-errormessage={emailError ? "sign-up-email-error" : undefined} aria-invalid={Boolean(emailError)} /><FieldDescription id="sign-up-email-description">${i18n.child("signUp.emailDescription", "This address becomes your sign-in identity.")}</FieldDescription><FieldError id="sign-up-email-error">{emailError}</FieldError></Field>); }}</form.Field>
        <form.Field name="password" validators={{ onChange: ({ value }) => (value.length>0 && value.length<8 ? ${i18n.value("validation.passwordTooShort", "At least 8")} : value.length > 64 ? ${i18n.value("validation.passwordTooLong", "Password must be 64 characters or fewer")} : undefined) }}>{(field) => { const passwordError = field.state.meta.errors[0] ? String(field.state.meta.errors[0]) : undefined; return (<Field data-invalid={Boolean(passwordError)}><FieldLabel htmlFor="sign-up-password">${i18n.child("signUp.passwordLabel", "Password")}</FieldLabel><Input id="sign-up-password" name={field.name} type="password" required minLength={8} maxLength={64} autoComplete="new-password" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} aria-describedby="sign-up-password-description" aria-errormessage={passwordError ? "sign-up-password-error" : undefined} aria-invalid={Boolean(passwordError)} /><FieldDescription id="sign-up-password-description">${i18n.child("signUp.passwordDescription", "Use between eight and sixty-four characters.")}</FieldDescription><FieldError id="sign-up-password-error">{passwordError}</FieldError></Field>); }}</form.Field>
        <Button type="submit" loading={credentialPending} disabled={credentialPending || oauthPending !== null}>${i18n.child("signUp.submit", "Create account")}</Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm"><span>${i18n.child("signUp.signInPrompt", "Already have an account?")}</span><Button render={<Link to="/sign-in" />} nativeButton={false} size="sm" variant="outline">${i18n.child("signUp.signInLink", "Sign in")}</Button></div>
    </main>
  );
}
`;
}
