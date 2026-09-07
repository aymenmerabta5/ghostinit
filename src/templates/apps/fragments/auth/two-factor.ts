import { sharedValidators } from "./validators.js";
import type { RouterType } from "./imports.js";

export function twoFactorPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const routerHook = isTanstack
    ? `  const navigate = useNavigate()\n  const [error, setError] = useState<string | null>(null)`
    : `  const router = useRouter();\n  const [error, setError] = useState<string | null>(null);`;
  const navigateLogic = isTanstack
    ? `      void navigate({ to: '/dashboard' })`
    : `      router.push("/dashboard");`;
  const imports = isTanstack
    ? `"use client"\nimport * as React from 'react'\nimport { createFileRoute, Link, useNavigate } from '@tanstack/react-router'\nimport { useState } from 'react'\nimport { z } from 'zod'
import { authClient } from '../lib/auth-client.js'\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form"\n\nexport const Route = createFileRoute('/2fa')({ component: TwoFactorPage, })`
    : `"use client";\nimport * as React from "react";\nimport { useRouter } from "next/navigation";\nimport { useState } from "react";\nimport Link from "next/link";\nimport { z } from "zod";
import { authClient } from "../../lib/auth-client.js";\nimport { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";\nimport { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";\nimport { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";`;
  const backLink = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">\n          ← Back to home\n        </Link>`;

  return `${imports}

interface TwoFactorForm { code: string; }

${isTanstack ? "function" : "export default function"} TwoFactorPage(): React.JSX.Element {
${routerHook}
  const totpSchema = z.object({ code: z.string().regex(/^[0-9]{6}$/, "Enter a 6-digit code") });
  const form = useForm({
    defaultValues: { code: "" } as TwoFactorForm,
    validators: { onSubmit: ({ value }) => { const p = totpSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null);
      const parsed = totpSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid code"); return; }
      const result = await authClient.twoFactor.verifyTotp({ code: parsed.data.code, trustDevice: true, });
      if (result.error) { setError(result.error.message ?? "Invalid code"); return; }
      ${navigateLogic}
    },
  });
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[420px] flex flex-col gap-6">
        ${backLink}
        <Card><CardHeader className="gap-3"><div className="flex items-center gap-2"><Badge variant="secondary">2FA</Badge><span className="text-xs text-muted-foreground">TOTP • trust device 30d</span></div><CardTitle className="text-2xl tracking-tight">Two-factor authentication</CardTitle><CardDescription className="max-w-[60ch]">Enter the 6-digit code from your authenticator app. Secure verification with server-side rate limiting and single-use replay protection.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? (<Alert variant="destructive"><AlertTitle>Invalid code</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>) : null}
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup><TanStackField form={form} name="code" validators={{ onChange: ({ value }) => (/^[0-9]{6}$/.test(value) ? undefined : "Enter a 6-digit code"), onSubmit: ({ value }) => ${sharedValidators.totp}, }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0} className="gap-3"><FieldLabel htmlFor="totp-code" className="text-sm">Authentication code</FieldLabel><Input id="totp-code" name={field.name} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" required aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} onBlur={field.handleBlur} className="font-mono tracking-[0.3em] text-center text-lg h-12" />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription className="max-w-[60ch]">Open your authenticator app such as Authy, 1Password, Google Authenticator. Code refreshes every 30 seconds.</FieldDescription>)}</Field>)}</TanStackField></FieldGroup>
              <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
                {([canSubmit, isSubmitting]) => (<SubmitButton className="w-full" disabled={!canSubmit} isPending={isSubmitting}>Verify and continue</SubmitButton>)}
              </form.Subscribe>
            </Form>
          </CardContent>
          <CardFooter className="flex-col gap-3"><div className="flex w-full justify-between text-sm">${isTanstack ? `<Link to="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Back to sign in\n              </Link>\n              <Link to="/settings" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Recovery codes\n              </Link>` : `<Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Back to sign in\n              </Link>\n              <Link href="/settings" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">\n                Recovery codes\n              </Link>`}</div></CardFooter>
        </Card>
        <p className="text-center text-xs text-muted-foreground max-w-[65ch] mx-auto">Trust device stores a secure httpOnly cookie for 30 days. Rate limited 60/min IP. Works offline with TOTP RFC6238.</p>
      </div>
    </main>
  );
}
`;
}
