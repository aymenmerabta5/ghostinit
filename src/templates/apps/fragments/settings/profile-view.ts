export function profileViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ProfileForm } from "../use-profile-form";
export function ProfileView({ email, role, model }: { email: string; role: string; model: ProfileForm }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { form, error } = model;
  return (
    <Card className="grid gap-0 overflow-hidden xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <CardHeader className="border-b border-border/70 bg-muted/20 xl:border-b-0 xl:border-e">
        <CardTitle as="h2">{t("profile.title")}</CardTitle>
        <CardDescription className="max-w-[44ch] break-words">{t("profile.description", { email, role })}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
        {error ? <Alert variant="destructive"><AlertTitle>{t("profile.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <form.AppForm>
          <Form form={form} className="flex max-w-xl flex-col gap-5">
            <FieldGroup>
              <form.AppField name="name">
                {(field) => <field.TextField label={t("profile.nameLabel")} description={t("profile.nameDescription")} placeholder={t("profile.namePlaceholder")} autoComplete="name" required maxLength={50} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton className="w-auto self-start" pendingLabel={t("profile.submitting")}>{t("profile.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
    </Card>
  );
}
`;
}
