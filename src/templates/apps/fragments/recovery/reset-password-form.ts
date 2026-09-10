import { file, type TemplateFile } from "../../../shared.js";
import type { RouterType } from "./reset-password.js";

export function resetPasswordFormContent(router: RouterType = "next"): string {
  const isTanstack = router === "tanstack";
  const routerImports = isTanstack
    ? 'import { Link } from "@tanstack/react-router";'
    : `import Link from "next/link";`;
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
              <form.SubmitButton className="h-10 w-full" pendingLabel={t("resetPassword.submitting")}>{t("resetPassword.submit")}</form.SubmitButton>
            </Form>
          </form.AppForm>`;
  const nextMissingToken = `<div className="flex flex-col gap-4">
              <p className="max-w-[65ch] text-sm text-muted-foreground">{t("resetPassword.invalidLinkDescription")}</p>
              <Button render={<Link href="/forgot-password" />} nativeButton={false}>{t("resetPassword.requestNewLink")}</Button>
            </div>`;
  return `"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
${routerImports}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, ${isTanstack ? "" : "CardFooter, "}CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { ResetPasswordFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";

export function ResetPasswordForm({ state }: { state: ResetPasswordFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form, token, error } = state;
${
  isTanstack
    ? `
  if (!token) {
    return (
      <Card className="w-full max-w-[440px] border-0 bg-transparent p-0 shadow-none">
        <CardHeader className="p-0 pb-6 sm:p-0 sm:pb-6"><CardTitle as="h1" className="text-3xl tracking-tight">{t("resetPassword.invalidLinkTitle")}</CardTitle><CardDescription className="max-w-[60ch]">{t("resetPassword.invalidLinkDescription")}</CardDescription></CardHeader>
        <CardContent className="p-0 sm:p-0"><Button render={<Link to="/forgot-password" />} nativeButton={false}>{t("resetPassword.requestNewLink")}</Button></CardContent>
      </Card>
    );
  }
`
    : ""
}
  return (
    <div className="flex w-full max-w-[440px] flex-col gap-8">
      ${isTanstack ? '<Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />{t("resetPassword.backHome")}</Link>' : ""}
      <Card className="border-0 bg-transparent p-0 shadow-none">
        <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
          <CardTitle as="h1" className="text-3xl tracking-tight">{t("resetPassword.title")}</CardTitle>
          <CardDescription className="max-w-[60ch]">{t("resetPassword.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
          {error ? <Alert variant=${isTanstack ? '"destructive"' : '{token ? "destructive" : "default"}'}><AlertTitle>{${isTanstack ? 't("resetPassword.errorTitle")' : 'token ? t("resetPassword.errorTitle") : t("resetPassword.invalidLinkTitle")'}}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          ${isTanstack ? fields : `{!token ? (${nextMissingToken}) : (${fields})}`}
        </CardContent>
        ${isTanstack ? "" : '<CardFooter className="mt-6 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5"><Link href="/sign-in" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />{t("resetPassword.backSignIn")}</Link></CardFooter>'}
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
