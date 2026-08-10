import { file, type TemplateFile } from "../../../shared.js";
export function settingsPasswordCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/password-card.tsx",
    `"use client";
import * as React from "react";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";
import { z } from "zod";
const passwordSchema = z.object({ currentPassword: z.string().min(1, "Current password required"), newPassword: z.string().min(8, "At least 8 characters").max(64) });
export function PasswordCard(): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "" } as { currentPassword: string; newPassword: string },
    validators: { onSubmit: ({ value }) => { const p = passwordSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(null);
      const parsed = passwordSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid"); return; }
      const result = await authClient.changePassword({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword, revokeOtherSessions: true });
      if (result.error) { setError(result.error.message ?? "Failed to update password"); return; }
      setSuccess("Password updated"); form.reset();
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Change password</CardTitle><CardDescription className="max-w-[60ch]">Use a strong password with at least 8 characters. Other sessions will be revoked.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Password error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>Updated</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
        <Form form={form} className="flex flex-col gap-4">
          <FieldGroup>
            <TanStackField form={form} name="currentPassword" validators={{ onSubmit: ({ value }) => (value.length < 1 ? "Current password required" : undefined) }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="current-password">Current password</FieldLabel><Input id="current-password" name={field.name} type="password" required autoComplete="current-password" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : null}</Field>)}</TanStackField>
            <TanStackField form={form} name="newPassword" validators={{ onSubmit: ({ value }) => (value.length < 8 ? "At least 8 characters" : undefined), onChange: ({ value }) => (value.length > 0 && value.length < 8 ? "At least 8" : undefined) }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="new-password">New password</FieldLabel><Input id="new-password" name={field.name} type="password" required minLength={8} autoComplete="new-password" aria-invalid={field.state.meta.errors.length > 0} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Must be at least 8 characters.</FieldDescription>)}</Field>)}</TanStackField>
          </FieldGroup>
          <SubmitButton>Update password</SubmitButton>
        </Form>
      </CardContent>
    </Card>
  );
}
`,
  );
}
