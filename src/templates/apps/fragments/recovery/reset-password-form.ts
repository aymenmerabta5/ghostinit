import { file, type TemplateFile } from "../../../shared.js";
import type { RouterType } from "./reset-password.js";

export function resetPasswordFormContent(router: RouterType = "next"): string {
  const isTanstack = router === "tanstack";
  const routerImports = isTanstack
    ? 'import { Link, useNavigate } from "@tanstack/react-router";'
    : `import Link from "next/link";
import { useRouter } from "next/navigation";`;
  const fields = `<form.AppForm>
            <Form form={form} className="flex flex-col gap-6">
              <FieldGroup>
                <form.AppField name="newPassword">
                  {(field) => <field.PasswordField label={t("resetPassword.newPasswordLabel")} description={t("resetPassword.newPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}
                </form.AppField>
                <form.AppField name="confirmPassword">
                  {(field) => <field.PasswordField label={t("resetPassword.confirmPasswordLabel")} description={t("resetPassword.confirmPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}
                </form.AppField>
              </FieldGroup>
              <form.SubmitButton className="w-full" pendingLabel={t("resetPassword.submitting")}>{t("resetPassword.submit")}</form.SubmitButton>
            </Form>
          </form.AppForm>`;
  const nextMissingToken = `<div className="flex flex-col gap-4">
              <p className="max-w-[65ch] text-sm text-muted-foreground">{t("resetPassword.invalidLinkDescription")}</p>
              <Button render={<Link href="/forgot-password" />} nativeButton={false}>{t("resetPassword.requestNewLink")}</Button>
            </div>`;
  return `"use client";
import type * as React from "react";
${routerImports}
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, ${isTanstack ? "" : "CardFooter, "}CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createResetPasswordSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

interface ResetPasswordFormProps {
  token: string;
  queryError: string | null;
}

export function ResetPasswordForm({ token, queryError }: ResetPasswordFormProps): React.JSX.Element {
  const ${isTanstack ? "navigate = useNavigate()" : "router = useRouter()"};
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const linkError = queryError
    ? queryError === "INVALID_TOKEN"
      ? t("resetPassword.expiredToken")
      : t("resetPassword.genericError")
    : token
      ? null
      : t("resetPassword.missingToken");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const error = submissionError ?? linkError;
  const form = useAppForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: {
      onSubmit: createResetPasswordSchema({
        passwordRequired: authT("validation.passwordRequired"),
        passwordTooShort: authT("validation.passwordTooShort"),
        passwordTooLong: authT("validation.passwordTooLong"),
        passwordMismatch: t("resetPassword.passwordMismatch"),
      }),
    },
    onSubmit: async ({ value }) => {
      setSubmissionError(null);
      const result = await identityClient.resetPassword({ newPassword: value.newPassword, token });
      if (result.error) {
        setSubmissionError(t("resetPassword.genericError"));
        return;
      }
      ${isTanstack ? 'void navigate({ to: "/sign-in" });' : 'router.push("/sign-in?reset=success");'}
    },
  });
${
  isTanstack
    ? `
  if (!token) {
    return (
      <Card className="w-full max-w-[420px]">
        <CardHeader><CardTitle as="h1" className="text-2xl tracking-tight">{t("resetPassword.invalidLinkTitle")}</CardTitle><CardDescription className="max-w-[60ch]">{t("resetPassword.invalidLinkDescription")}</CardDescription></CardHeader>
        <CardContent><Button render={<Link to="/forgot-password" />} nativeButton={false}>{t("resetPassword.requestNewLink")}</Button></CardContent>
      </Card>
    );
  }
`
    : ""
}
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      ${isTanstack ? '<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("resetPassword.backHome")}</Link>' : ""}
      <Card>
        <CardHeader${isTanstack ? ' className="gap-2"' : ""}>
          <CardTitle as="h1"${isTanstack ? ' className="text-2xl tracking-tight"' : ""}>{t("resetPassword.title")}</CardTitle>
          <CardDescription${isTanstack ? ' className="max-w-[60ch]"' : ""}>{t("resetPassword.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error ? <Alert variant=${isTanstack ? '"destructive"' : '{token ? "destructive" : "default"}'}><AlertTitle>{${isTanstack ? 't("resetPassword.errorTitle")' : 'token ? t("resetPassword.errorTitle") : t("resetPassword.invalidLinkTitle")'}}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          ${isTanstack ? fields : `{!token ? (${nextMissingToken}) : (${fields})}`}
        </CardContent>
        ${isTanstack ? "" : '<CardFooter><Link href="/sign-in" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">{t("resetPassword.backSignIn")}</Link></CardFooter>'}
      </Card>
    </div>
  );
}
`;
}

export function resetPasswordForm(router: RouterType = "next"): TemplateFile {
  return file(
    "apps/web/src/components/auth/reset-password-form.tsx",
    resetPasswordFormContent(router),
  );
}
