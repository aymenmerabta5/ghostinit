import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

const nextContent = `"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "../../lib/auth-client.js";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Alert, AlertTitle, AlertDescription } from "@repo/ui";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@repo/ui";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@repo/ui/form";
interface ResetPasswordForm { newPassword: string; confirmPassword: string; }
function ResetPasswordInner(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const token = searchParams.get("token") ?? "";
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(urlError === "INVALID_TOKEN" ? "Invalid or expired reset link. Please request a new one." : urlError);
    else if (!token) setError("Missing reset token. Use the link from your email.");
  }, [searchParams, token]);
  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" } as ResetPasswordForm,
    onSubmit: async ({ value }) => {
      setError(null);
      if (value.newPassword !== value.confirmPassword) { setError("Passwords do not match"); return; }
      if (value.newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
      const result = await authClient.resetPassword({ newPassword: value.newPassword, token });
      if (result.error) { setError(result.error.message ?? "Failed to reset password"); return; }
      router.push("/sign-in?reset=success");
    },
  });
  return (
    <div className="w-full max-w-[420px] flex flex-col gap-6">
      <Card><CardHeader><CardTitle>Reset password</CardTitle><CardDescription>Choose a new password. Your link expires in 1 hour and can only be used once.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error ? <Alert variant={token ? "destructive" : "default"}><AlertTitle>{token ? "Cannot reset password" : "Invalid link"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {!token ? (<div className="flex flex-col gap-4"><p className="text-sm text-muted-foreground max-w-[65ch]">No valid token found. Request a new reset link from the forgot password page.</p><Link href="/forgot-password"><Button>Request new link</Button></Link></div>) : (
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup>
                <TanStackField form={form} name="newPassword" validators={{ onSubmit: ({ value }) => value.length >= 8 ? undefined : "Password must be at least 8 characters" }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" name={field.name} type="password" autoComplete="new-password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? <FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription> : <FieldDescription>Must be at least 8 characters. Longer is stronger.</FieldDescription>}</Field>)}</TanStackField>
                <TanStackField form={form} name="confirmPassword" validators={{ onSubmit: ({ value }) => value.length >= 8 ? undefined : "Password must be at least 8 characters" }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><Input id="confirm-password" name={field.name} type="password" autoComplete="new-password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} /><FieldDescription>Must match the new password above.</FieldDescription></Field>)}</TanStackField>
              </FieldGroup>
              <SubmitButton className="w-full">Reset password</SubmitButton>
            </Form>
          )}
        </CardContent>
        <CardFooter><Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">Back to sign in</Link></CardFooter>
      </Card>
    </div>
  );
}
export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Suspense fallback={<div className="w-full max-w-[420px]"><Card><CardHeader><CardTitle>Reset password</CardTitle><CardDescription>Loading reset link validation.</CardDescription></CardHeader></Card></div>}>
        <ResetPasswordInner />
      </Suspense>
    </main>
  );
}
`;

const tanstackContent = `"use client"
import * as React from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth-client.js'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Alert, AlertTitle, AlertDescription } from '@repo/ui'
import { FieldGroup, Field, FieldLabel, FieldDescription } from '@repo/ui'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage(): React.JSX.Element {
  const navigate = useNavigate()
  const search = Route.useSearch() as { token?: string }
  const token = (search as any)?.token ?? (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null)

  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-[420px] shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">Invalid token</CardTitle>
            <CardDescription className="max-w-[60ch]">The reset link is missing or expired. Request a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full"><Link to="/forgot-password">Request new link</Link></Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    const result = await authClient.resetPassword({ newPassword, token } as any)
    if (result.error) {
      setError(result.error.message ?? 'Failed to reset password')
      return
    }
    void navigate({ to: '/sign-in' })
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        <Card className="shadow-sm">
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl tracking-tight">Reset password</CardTitle>
            <CardDescription className="max-w-[60ch]">Enter your new password. Must be at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>Unable to reset</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="new-password">New password</FieldLabel>
                  <Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <FieldDescription>At least 8 characters.</FieldDescription>
                </Field>
              </FieldGroup>
              <Button type="submit" className="w-full">Reset password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
`;

export function resetPasswordPageContent(router: RouterType = "next"): string {
  return router === "tanstack" ? tanstackContent : nextContent;
}

export function resetPasswordPage(router: RouterType = "next"): TemplateFile {
  if (router === "tanstack") {
    return file("apps/web/src/routes/reset-password.tsx", tanstackContent);
  }
  return file("apps/web/src/app/reset-password/page.tsx", nextContent);
}
