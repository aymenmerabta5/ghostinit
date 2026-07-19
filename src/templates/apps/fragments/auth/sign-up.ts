import { sharedValidators } from "./validators.js";
import { signUpNavigateLogic, type RouterType } from "./navigation.js";

export function signUpPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const routerHook = isTanstack
    ? `  const navigate = useNavigate()\n  const [error, setError] = useState<string | null>(null)`
    : `  const router = useRouter();\n  const [error, setError] = useState<string | null>(null);`;
  const imports = isTanstack
    ? `"use client"\nimport * as React from 'react'\nimport { createFileRoute, Link, useNavigate } from '@tanstack/react-router'\nimport { useState } from 'react'\nimport { authClient } from '../lib/auth-client.js'\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Alert, AlertTitle, AlertDescription } from '@repo/ui'\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from '@repo/ui'\nimport { Form, Field as TanStackField, SubmitButton, useForm } from '@repo/ui/form'\n\nexport const Route = createFileRoute('/sign-up')({ component: SignUpPage, })`
    : `"use client";\nimport * as React from "react";\nimport { useRouter } from "next/navigation";\nimport { useState } from "react";\nimport Link from "next/link";\nimport { authClient } from "../../lib/auth-client.js";\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Alert, AlertTitle, AlertDescription } from "@repo/ui";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@repo/ui";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@repo/ui/form";`;
  const backLink = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">\n          ← Back to home\n        </Link>`;
  return `${imports}

interface SignUpForm { name: string; email: string; password: string; }

${isTanstack ? "function" : "export default function"} SignUpPage(): React.JSX.Element {
${routerHook}
  const form = useForm({
    defaultValues: { name: "", email: "", password: "", } as SignUpForm,
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await authClient.signUp.email({ name: value.name, email: value.email, password: value.password, callbackURL: "/dashboard", });
      if (result.error) { setError(result.error.message ?? "Sign up failed"); return; }
      ${signUpNavigateLogic(router)}
    },
  });
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        ${backLink}
        <Card className="shadow-sm"><CardHeader className="gap-2"><CardTitle className="text-2xl tracking-tight">Create account</CardTitle><CardDescription className="max-w-[60ch]">Start your workspace. Passwords hashed with scrypt. Secret strength validation length 32+ server side.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? (<Alert variant="destructive"><AlertTitle>Unable to create account</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>) : null}
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup>
                <TanStackField form={form} name="name" validators={{ onSubmit: ({ value }) => (${sharedValidators.name}), }} >{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signup-name">Name</FieldLabel><Input id="signup-name" name={field.name} type="text" placeholder="Ada Lovelace" autoComplete="name" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your display name.</FieldDescription>)}</Field>)}</TanStackField>
                <TanStackField form={form} name="email" validators={{ onSubmit: ({ value }) => (${sharedValidators.email}), }} >{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signup-email">Email</FieldLabel><Input id="signup-email" name={field.name} type="email" placeholder="you@example.com" autoComplete="email" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your account email address.</FieldDescription>)}</Field>)}</TanStackField>
                <TanStackField form={form} name="password" validators={{ onSubmit: ({ value }) => (${sharedValidators.password}), }} >{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="signup-password">Password</FieldLabel><Input id="signup-password" name={field.name} type="password" autoComplete="new-password" required minLength={8} aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Must be at least 8 characters. Longer is stronger.</FieldDescription>)}</Field>)}</TanStackField>
              </FieldGroup>
              <SubmitButton className="w-full">Create account</SubmitButton>
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
