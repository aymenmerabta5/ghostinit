export function passwordViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { PasswordForm } from "../use-password-form";
export function PasswordView({ model }: { model: PasswordForm }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { form, error } = model;
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
