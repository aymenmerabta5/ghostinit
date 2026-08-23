import { sharedValidators } from "./validators.js";
import { signUpNavigateLogic, type RouterType } from "./navigation.js";

export function signUpPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const routerHook = isTanstack
    ? `  const navigate = useNavigate()\n  const [error, setError] = useState<string | null>(null)`
    : `  const router = useRouter();\n  const [error, setError] = useState<string | null>(null);`;
  const imports = isTanstack
    ? `"use client"\nimport * as React from 'react'\nimport { createFileRoute, Link, useNavigate } from '@tanstack/react-router'\nimport { useState } from 'react'\nimport { z } from 'zod'\nimport { authClient } from '../lib/auth-client.js'\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form"\n\nexport const Route = createFileRoute('/sign-up')({ component: SignUpPage, })`
    : `"use client";\nimport * as React from "react";\nimport { useRouter } from "next/navigation";\nimport { useState } from "react";\nimport Link from "next/link";\nimport { z } from "zod";\nimport { authClient } from "../../lib/auth-client.js";\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";`;
  const backLink = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">\n          ← Back to home\n        </Link>`;
  return `${imports}

interface SignUpForm { name: string; email: string; password: string; }

${isTanstack ? "function" : "export default function"} SignUpPage(): React.JSX.Element {
${routerHook}
  const signUpSchema = z.object({ name: z.string().min(2, "Name must be at least 2 characters"), email: z.string().email("Enter a valid email"), password: z.string().min(8, "Password must be at least 8 characters").max(64) });
  const form = useForm({
    defaultValues: { name: "", email: "", password: "", } as SignUpForm,
    validators: { onSubmit: ({ value }) => { const p = signUpSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = signUpSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid input"); return; }
      const result = await authClient.signUp.email({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, callbackURL: "/dashboard", });
      if (result.error) { setError(result.error.message ?? "Sign up failed"); return; }
      ${signUpNavigateLogic(router)}
    },
  });
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        ${backLink}
        <Card><CardHeader className="gap-2"><CardTitle className="text-2xl tracking-tight">Create account</CardTitle><CardDescription className="max-w-[60ch]">Start your workspace. Passwords hashed with scrypt. Secret strength validation length 32+ server side.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? (<Alert variant="destructive"><AlertTitle>Unable to create account</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>) : null}
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" onClick={async () => { await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" }); }}>Google</Button>
              <Button type="button" variant="outline" onClick={async () => { await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" }); }}>GitHub</Button>
            </div>
            <div className="relative flex items-center gap-3 py-2"><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><span className="h-px flex-1 bg-border" /></div>
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup>
                <TanStackField form={form} name="name" validators={{ onChange: ({ value }) => (value.trim().length >= 2 ? undefined : "Name must be at least 2 characters"), onSubmit: ({ value }) => (${sharedValidators.name}), }} >{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signup-name">Name</FieldLabel><Input id="signup-name" name={field.name} type="text" placeholder="Ada Lovelace" autoComplete="name" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your display name.</FieldDescription>)}</Field>)}</TanStackField>
                <TanStackField form={form} name="email" validators={{ onChange: ({ value }) => (!/\\S+@\\S+\\.\\S+/.test(value) ? "Enter a valid email" : undefined), onSubmit: ({ value }) => (${sharedValidators.email}), }} >{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signup-email">Email</FieldLabel><Input id="signup-email" name={field.name} type="email" placeholder="you@example.com" autoComplete="email" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your account email address.</FieldDescription>)}</Field>)}</TanStackField>
                <TanStackField form={form} name="password" validators={{ onChange: ({ value }) => (value.length >= 8 ? undefined : "Password must be at least 8 characters"), onSubmit: ({ value }) => (${sharedValidators.password}), }} >{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signup-password">Password</FieldLabel><Input id="signup-password" name={field.name} type="password" autoComplete="new-password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Must be at least 8 characters. Longer is stronger.</FieldDescription>)}</Field>)}</TanStackField>
              </FieldGroup>
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (<SubmitButton className="w-full" disabled={!canSubmit} isPending={isSubmitting}>Create account</SubmitButton>)}
              </form.Subscribe>
            </Form>
          </CardContent>
          <CardFooter className="flex-col gap-3"><div className="flex w-full justify-center text-sm">${isTanstack ? `<Link to="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Already have an account? Sign in\n              </Link>` : `<Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Already have an account? Sign in\n              </Link>`}</div></CardFooter>
        </Card>
        <p className="text-center text-xs text-muted-foreground max-w-[65ch] mx-auto">By continuing you agree to our terms. Session cookie httpOnly secure sameSite lax. Better Auth 1.6.23.</p>
      </div>
    </main>
  );
}
`;
}
