import { sharedValidators } from "./validators.js";
import { linkTo, signInNavigateLogic, type RouterType } from "./navigation.js";

export function signInFormFields(router: RouterType): string {
  const forgot = linkTo(
    router,
    "/forgot-password",
    "text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline",
    "Forgot?",
  );
  return `              <FieldGroup>
                <TanStackField form={form} name="email" validators={{ onChange: ({ value }) => (!/\\S+@\\S+\\.\\S+/.test(value) ? "Enter a valid email" : undefined), onSubmit: ({ value }) => (${sharedValidators.email}), }}>
                  {(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signin-email">Email</FieldLabel><Input id="signin-email" name={field.name} type="email" placeholder="you@example.com" autoComplete="email" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your account email address.</FieldDescription>)}</Field>)}
                </TanStackField>
                <TanStackField form={form} name="password" validators={{ onChange: ({ value }) => (value.length >= 8 ? undefined : "Password must be at least 8 characters"), onSubmit: ({ value }) => (${sharedValidators.password}), }}>
                  {(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><div className="flex items-center justify-between gap-2"><FieldLabel htmlFor="signin-password">Password</FieldLabel>${forgot}</div><Input id="signin-password" name={field.name} type="password" autoComplete="current-password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : null}</Field>)}
                </TanStackField>
              </FieldGroup>
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (
                  <SubmitButton className="w-full" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? (<><Spinner data-icon="inline-start" />Signing in...</>) : "Sign in"}
                  </SubmitButton>
                )}
              </form.Subscribe>`;
}

export function oauthButtons(_router: RouterType): string {
  const googleAction = `async () => { await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" }); }`;
  const githubAction = `async () => { await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" }); }`;
  return `            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" onClick={${googleAction}}>Google</Button>
              <Button type="button" variant="outline" onClick={${githubAction}}>GitHub</Button>
            </div>
            <div className="relative flex items-center gap-3 py-2"><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><span className="h-px flex-1 bg-border" /></div>`;
}

export function signInPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const routerHook = isTanstack
    ? `  const navigate = useNavigate()\n  const [error, setError] = useState<string | null>(null)`
    : `  const router = useRouter();\n  const [error, setError] = useState<string | null>(null);`;
  const imports = isTanstack
    ? `"use client"\nimport * as React from 'react'\nimport { createFileRoute, Link, useNavigate } from '@tanstack/react-router'\nimport { useState } from 'react'\nimport { z } from 'zod'\nimport { authClient } from '../lib/auth-client.js'\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form"\n\nexport const Route = createFileRoute('/sign-in')({ component: SignInPage, })`
    : `"use client";\nimport * as React from "react";\nimport { useRouter } from "next/navigation";\nimport { useState } from "react";\nimport Link from "next/link";\nimport { z } from "zod";\nimport { authClient } from "../../lib/auth-client.js";\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";`;
  const backLink = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">\n          ← Back to home\n        </Link>`;
  const footerLinks = isTanstack
    ? `<div className="flex w-full justify-between text-sm"><Link to="/forgot-password" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Forgot password?</Link><Link to="/sign-up" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">Create account</Link></div>`
    : `<div className="flex w-full justify-between text-sm"><Link href="/forgot-password" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Forgot password?\n              </Link><Link href="/sign-up" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Create account\n              </Link></div>`;

  return `${imports}

interface SignInForm { email: string; password: string; }

${isTanstack ? "function" : "export default function"} SignInPage(): React.JSX.Element {
${routerHook}
  const signInSchema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(8, "Password must be at least 8 characters").max(64) });
  const form = useForm({
    defaultValues: { email: "", password: "", } as SignInForm,
    validators: { onSubmit: ({ value }) => { const p = signInSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = signInSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid input"); return; }
      const result = await authClient.signIn.email({ email: parsed.data.email, password: parsed.data.password, callbackURL: "/dashboard", });
      if (result.error) { setError(result.error.message ?? "Sign in failed"); return; }
${signInNavigateLogic(router)}
    },
  });
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        ${backLink}
        <Card><CardHeader className="gap-2"><CardTitle className="text-2xl tracking-tight">Sign in</CardTitle><CardDescription className="max-w-[60ch]">Enter your credentials to access your account. Secure session with httpOnly lax cookies.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? (<Alert variant="destructive"><AlertTitle>Unable to sign in</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>) : null}
${oauthButtons(router)}
            <Form form={form} className="flex flex-col gap-6">
${signInFormFields(router)}
            </Form>
          </CardContent>
          <CardFooter className="flex-col gap-3">${footerLinks}</CardFooter>
        </Card>
        <p className="text-center text-xs text-muted-foreground max-w-[65ch] mx-auto">Session cookie httpOnly secure sameSite lax. Rate limit 60 requests per minute. Better Auth 1.6.23 with admin + 2FA TOTP.</p>
      </div>
    </main>
  );
}
`;
}
