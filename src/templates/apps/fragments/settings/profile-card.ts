import { file, type TemplateFile } from "../../../shared.js";
export function settingsProfileCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/profile-card.tsx",
    `"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { z } from "zod";
const profileSchema = z.object({ name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be under 50") });
interface ProfileForm { name: string; }
export function ProfileCard(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: user?.name ?? "" } as ProfileForm,
    validators: { onSubmit: ({ value }) => { const p = profileSchema.safeParse(value); return p.success ? undefined : p.error.issues[0]?.message; } },
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(null);
      const parsed = profileSchema.safeParse(value);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid name"); return; }
      const result = await authClient.updateUser({ name: parsed.data.name });
      if (result.error) { setError(result.error.message ?? "Failed to update profile"); return; }
      setSuccess("Profile updated");
    },
  });
  useEffect(() => { if (user?.name) form.setFieldValue("name", user.name); }, [user?.name, form]);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Profile</CardTitle><CardDescription className="max-w-[60ch]">Update your display name. Email {user?.email ?? ""}. Role {user?.role ?? "user"}.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Unable to update</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>Success</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
        <Form form={form} className="flex flex-col gap-5">
          <FieldGroup>
            <TanStackField form={form} name="name" validators={{ onChange: ({ value }) => (value.trim().length < 2 ? "At least 2 characters" : undefined), onSubmit: ({ value }) => { const p = profileSchema.safeParse({ name: value }); return p.success ? undefined : p.error.issues[0]?.message; } }}>{(field) => (<Field data-invalid={field.state.meta.errors.length > 0}><FieldLabel htmlFor="profile-name">Name</FieldLabel><Input id="profile-name" name={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Ada Lovelace" aria-invalid={field.state.meta.errors.length > 0} />{field.state.meta.errors.length > 0 ? (<FieldDescription className="text-destructive">{field.state.meta.errors.join(", ")}</FieldDescription>) : (<FieldDescription>Your display name visible to the workspace.</FieldDescription>)}</Field>)}</TanStackField>
          </FieldGroup>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => (
              <SubmitButton disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {isSubmitting ? "Updating profile…" : "Update profile"}
              </SubmitButton>
            )}
          </form.Subscribe>
        </Form>
      </CardContent>
    </Card>
  );
}
`,
  );
}
