import { file, type TemplateFile } from "../../../shared.js";

export function settingsProfileCardContent(useServerActions = false): string {
  const actionImport = useServerActions ? 'import { updateProfileAction } from "../actions";' : "";
  const submit = useServerActions
    ? `const result = await updateProfileAction({ name: value.name });
      if (!result.ok) {
        setError(result.error);
        return;
      }`
    : `const result = await identityClient.updateProfile({ name: value.name });
      if (result.error) {
        setError(result.error.message ?? t("errors.profileUpdate"));
        return;
      }`;
  return `"use client";

import type * as React from "react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createProfileSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";
${actionImport}

interface ProfileEditorProps {
  email: string;
  initialName: string;
  role: string;
}

function ProfileEditor({ email, initialName, role }: ProfileEditorProps): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const form = useAppForm({
    defaultValues: { name: initialName },
    validators: {
      onSubmit: createProfileSchema({
        nameRequired: t("validation.nameRequired"),
        nameTooShort: t("validation.nameTooShort"),
        nameTooLong: t("validation.nameTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(null);
      setSuccess(false);
      ${submit}
      setSuccess(true);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("profile.title")}</CardTitle>
        <CardDescription className="max-w-[60ch]">{t("profile.description", { email, role })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>{t("profile.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>{t("profile.successTitle")}</AlertTitle><AlertDescription>{t("profile.successMessage")}</AlertDescription></Alert> : null}
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-5">
            <FieldGroup>
              <form.AppField name="name">
                {(field) => <field.TextField label={t("profile.nameLabel")} description={t("profile.nameDescription")} placeholder={t("profile.namePlaceholder")} autoComplete="name" required maxLength={50} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton pendingLabel={t("profile.submitting")}>{t("profile.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}

export interface ProfileCardProps { initialUser?: { id: string; email: string; name: string | null; role: string | null }; }

function ProfileCardFromSession(): React.JSX.Element {
  const { data: session } = identityClient.useSession();
  const user = session?.user;
  const roleValue = user && typeof user === "object" ? Reflect.get(user, "role") : undefined;
  const role = typeof roleValue === "string" ? roleValue : "user";
  return (
    <ProfileEditor
      key={user ? user.id + ":" + (user.name ?? "") : "anonymous"}
      email={user?.email ?? ""}
      initialName={user?.name ?? ""}
      role={role}
    />
  );
}

export function ProfileCard({ initialUser }: ProfileCardProps): React.JSX.Element {
  if (!initialUser) return <ProfileCardFromSession />;
  return <ProfileEditor key={initialUser.id + ":" + (initialUser.name ?? "")} email={initialUser.email} initialName={initialUser.name ?? ""} role={initialUser.role ?? "user"} />;
}
`;
}

export function settingsProfileCard(useServerActions = false): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/profile-card.tsx",
    settingsProfileCardContent(useServerActions),
  );
}
