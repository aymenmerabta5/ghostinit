import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

const nextContent = `"use client";
import * as React from "react";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "../../lib/auth-client.js";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Alert, AlertTitle, AlertDescription } from "@repo/ui";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@repo/ui";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@repo/ui/form";
interface ForgotPasswordForm { email: string; }
export default function ForgotPasswordPage(): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "" } as ForgotPasswordForm,
    onSubmit: async ({ value }) => {
      setError(null); setStatus(null);
      if (!value.email.includes("@")) { setError("Enter a valid email that contains @"); return; }
      const result = await authClient.requestPasswordReset({ email: value.email, redirectTo: "/reset-password" });
      if (result.error) { setError(result.error.message ?? "Failed to send reset link"); return; }
      setStatus("If this email exists in our system, check your inbox for the reset link.");
    },
  });
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-8">
        <div className="flex flex-col gap-2"><Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link></div>
        <Card><CardHeader><CardTitle>Forgot password</CardTitle><CardDescription>Enter your email and we will send you a link to reset your password. The link expires in 1 hour and can only be used once.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>Unable to send link</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {status ? <Alert><AlertTitle>Check your email</AlertTitle><AlertDescription>{status}</AlertDescription></Alert> : null}
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup><TanStackField form={form} name="email" validators={{ onSubmit: ({ value }) => (value.includes("@") ? undefined : "Enter a valid email") }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="forgot-email">Email</FieldLabel><Input id="forgot-email" name={field.name} type="email" placeholder="you@example.com" autoComplete="email" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? <FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription> : <FieldDescription>We send a reset link to this address if it exists in our system.</FieldDescription>}</Field>)}</TanStackField></FieldGroup>
              <SubmitButton className="w-full">Send reset link</SubmitButton>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3"><div className="flex w-full justify-between text-sm"><Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline underline-offset-4">Back to sign in</Link><Link href="/sign-up" className="text-muted-foreground hover:text-foreground underline underline-offset-4">Create account</Link></div></CardFooter>
        </Card>
      </div>
    </main>
  );
}
`;

const tanstackContent = `"use client"
import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth-client.js'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Alert, AlertTitle, AlertDescription } from '@repo/ui'
import { FieldGroup, Field, FieldLabel, FieldDescription } from '@repo/ui'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const result = await authClient.forgetPassword({ email, redirectTo: '/reset-password' })
      if (result.error) {
        setError(result.error.message ?? 'Failed to send reset email')
        return
      }
      setSuccess('Check your email for a password reset link.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        <Card className="shadow-sm">
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl tracking-tight">Forgot password</CardTitle>
            <CardDescription className="max-w-[60ch]">Enter your email to receive a reset link.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>Unable to send</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {success ? <Alert><AlertTitle>Check your email</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
                  <Input id="forgot-email" type="email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  <FieldDescription>We will send a reset link to this address.</FieldDescription>
                </Field>
              </FieldGroup>
              <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Sending...' : 'Send reset link'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
`;

export function forgotPasswordPageContent(router: RouterType = "next"): string {
  return router === "tanstack" ? tanstackContent : nextContent;
}

export function forgotPasswordPage(router: RouterType = "next"): TemplateFile {
  if (router === "tanstack") {
    return file("apps/web/src/routes/forgot-password.tsx", tanstackContent);
  }
  return file("apps/web/src/app/forgot-password/page.tsx", nextContent);
}
