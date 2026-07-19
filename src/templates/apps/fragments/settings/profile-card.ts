import { file, type TemplateFile } from "../../../shared.js";
export function settingsProfileCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/profile-card.tsx",
    `"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { authClient } from "../../../lib/auth-client.js";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Input, Alert, AlertTitle, AlertDescription } from "@repo/ui";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "@repo/ui";
import { Form, Field as TanStackField, SubmitButton, useForm } from "@repo/ui/form";
interface ProfileForm { name: string; }
export function ProfileCard(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { name: (user?.name as string) ?? "" } as ProfileForm,
    onSubmit: async ({ value }) => {
      setError(null); setSuccess(null);
      const result = await authClient.updateUser({ name: value.name });
      if (result.error) { setError(result.error.message ?? "Failed to update profile"); return; }
      setSuccess("Profile updated");
    },
  });
  useEffect(() => { if (user?.name) form.setFieldValue("name", user.name as string); }, [user?.name, form]);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Profile</CardTitle><CardDescription className="max-w-[60ch]">Update your display name. Email {(user?.email as string) ?? ""}. Role {(user as any)?.role ?? "user"}.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>Unable to update</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>Success</AlertTitle><AlertDescription>{success}</AlertDescription></Alert> : null}
        <Form form={form} className="flex flex-col gap-5">
          <FieldGroup>
            <TanStackField form={form} name="name">{(field) => (<Field><FieldLabel htmlFor="profile-name">Name</FieldLabel><Input id="profile-name" name={field.name} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} placeholder="Ada Lovelace" /><FieldDescription>Your display name visible to the workspace.</FieldDescription></Field>)}</TanStackField>
          </FieldGroup>
          <SubmitButton>Update profile</SubmitButton>
        </Form>
      </CardContent>
    </Card>
  );
}
`,
  );
}
