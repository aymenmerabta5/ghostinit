import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

const nextContent = `"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "../../lib/auth-client.js";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";
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
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                  <SubmitButton className="w-full" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? (<><Spinner data-icon="inline-start" />Resetting password...</>) : "Reset password"}
                  </SubmitButton>
                )}
              </form.Subscribe>
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
import { z } from "zod";
import { authClient } from '../lib/auth-client.js'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";

const resetPasswordSchema = z.object({ newPassword: z.string().min(8, "Password must be at least 8 characters").max(64, "Password must be under 64"), confirmPassword: z.string().min(8, "Confirm at least 8") }).refine((d) => d.newPassword === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

interface ResetPasswordForm { newPassword: string; confirmPassword: string; }

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage(): React.JSX.Element {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const token = search.token
  const initialError = search.error === "INVALID_TOKEN" ? "Invalid or expired reset link. Please request a new one." : search.error ?? null
  const [error, setError] = useState<string | null>(initialError)
  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" } as ResetPasswordForm,
    validators: {
      onSubmit: ({ value }) => {
        const parsed = resetPasswordSchema.safeParse(value);
        if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid";
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = resetPasswordSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Password must be at least 8"); return; }
      const result = await authClient.resetPassword({ newPassword: parsed.data.newPassword, token: token! })
      if (result.error) { setError(result.error.message ?? 'Failed to reset password'); return; }
      void navigate({ to: '/sign-in' })
    },
  });

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-[420px] shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl tracking-tight">Invalid token</CardTitle>
            <CardDescription className="max-w-[60ch]">The reset link is missing or expired. Request a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password" className="text-sm text-primary underline">Request new link</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl tracking-tight">Reset password</CardTitle>
            <CardDescription className="max-w-[60ch]">Enter your new password. Must be at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error || !token ? <Alert variant="destructive"><AlertTitle>Unable to reset</AlertTitle><AlertDescription>{error ?? "Missing reset token. Use the link from your email."}</AlertDescription></Alert> : null}
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup>
                <TanStackField form={form} name="newPassword" validators={{ onChange: ({ value }) => (value.length < 8 ? "At least 8 characters" : undefined), onSubmit: ({ value }) => (value.length < 8 ? "Password must be at least 8" : undefined) }}>
                  {(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" name={field.name} type="password" required minLength={8} autoComplete="new-password" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>At least 8 characters.</FieldDescription>)}</Field>)}
                </TanStackField>
                <TanStackField form={form} name="confirmPassword" validators={{ onSubmit: ({ value, fieldApi }) => { const parent = fieldApi.form.getFieldValue("newPassword") as string; if (value !== parent) return "Passwords do not match"; if (value.length < 8) return "At least 8"; return undefined; } }}>
                  {(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel><Input id="confirm-password" name={field.name} type="password" required minLength={8} autoComplete="new-password" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Must match above.</FieldDescription>)}</Field>)}
                </TanStackField>
              </FieldGroup>
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                  <SubmitButton className="w-full" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? (<><Spinner data-icon="inline-start" />Resetting password...</>) : "Reset password"}
                  </SubmitButton>
                )}
              </form.Subscribe>
            </Form>
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
