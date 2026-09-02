import { file, type TemplateFile } from "../../../shared.js";

export function settingsPasswordCardContent(useServerActions = false): string {
  const actionImport = useServerActions ? 'import { changePasswordAction } from "../actions";' : "";
  const authImport = useServerActions
    ? 'import { createChangePasswordSchema } from "@/lib/auth-client";'
    : 'import { createChangePasswordSchema, identityClient } from "@/lib/auth-client";';
  const submit = useServerActions
    ? `const result = await changePasswordAction(value);
      if (!result.ok) {
        setError(result.error);
        return;
      }`
    : `const result = await identityClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(result.error.message ?? t("errors.passwordUpdate"));
        return;
      }`;
  return `"use client";

import type * as React from "react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
${authImport}
import { useSurfaceTranslations } from "@/lib/translations";
${actionImport}

export function PasswordCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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
      setSuccess(false);
      ${submit}
      setSuccess(true);
      form.reset();
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("password.title")}</CardTitle><CardDescription className="max-w-[60ch]">{t("password.description")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>{t("password.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {success ? <Alert><AlertTitle>{t("password.successTitle")}</AlertTitle><AlertDescription>{t("password.successMessage")}</AlertDescription></Alert> : null}
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-4">
            <FieldGroup>
              <form.AppField name="currentPassword">
                {(field) => <field.PasswordField label={t("password.currentPasswordLabel")} autoComplete="current-password" required />}
              </form.AppField>
              <form.AppField name="newPassword">
                {(field) => <field.PasswordField label={t("password.newPasswordLabel")} description={t("password.newPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton pendingLabel={t("password.submitting")}>{t("password.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
`;
}

export function settingsPasswordCard(useServerActions = false): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/password-card.tsx",
    settingsPasswordCardContent(useServerActions),
  );
}
