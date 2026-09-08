import { file, type TemplateFile } from "../../../shared.js";

export function settingsPasswordCardContent(): string {
  return `"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createChangePasswordSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export function PasswordCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "" },
    validators: {
      onSubmit: createChangePasswordSchema({
        currentPasswordRequired: t("validation.currentPasswordRequired"),
        passwordRequired: t("validation.passwordRequired"),
        passwordTooShort: t("validation.passwordTooShort"),
        passwordTooLong: t("validation.passwordTooLong"),
      }),
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const result = await identityClient.changePassword({
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
          revokeOtherSessions: true,
        });
        if (result.error) {
          setError(result.error.message ?? t("errors.passwordUpdate"));
          return;
        }
        form.reset();
        // Session rotation remounts this card; feedback belongs to the toast store.
        toast.success(t("password.successTitle"), { description: t("password.successMessage") });
      } catch {
        setError(t("errors.passwordUpdate"));
      }
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle as="h2">{t("password.title")}</CardTitle><CardDescription className="max-w-[60ch]">{t("password.description")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>{t("password.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-5">
            <FieldGroup>
              <form.AppField name="currentPassword">
                {(field) => <field.PasswordField label={t("password.currentPasswordLabel")} autoComplete="current-password" required />}
              </form.AppField>
              <form.AppField name="newPassword">
                {(field) => <field.PasswordField label={t("password.newPasswordLabel")} description={t("password.newPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton className="w-auto self-start" pendingLabel={t("password.submitting")}>{t("password.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
`;
}

export function settingsPasswordCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/password-card.tsx",
    settingsPasswordCardContent(),
  );
}
