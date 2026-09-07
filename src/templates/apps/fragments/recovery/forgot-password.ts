import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

export function forgotPasswordPageContent(router: RouterType = "next"): string {
  const isTanstack = router === "tanstack";
  const imports = isTanstack
    ? `"use client";
import type * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createEmailSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });`
    : `"use client";
import type * as React from "react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createEmailSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const backHome = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("forgotPassword.backHome")}</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("forgotPassword.backHome")}</Link>`;
  const footer = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.backSignIn")}</Link><Link to="/sign-up" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.createAccount")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.backSignIn")}</Link><Link href="/sign-up" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.createAccount")}</Link>`;

  return `${imports}

${isTanstack ? "function" : "export default function"} ForgotPasswordPage(): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: createEmailSchema(authT("validation.invalidEmail")) },
    onSubmit: async ({ value }) => {
      setError(null);
      setSuccess(false);
      const result = await identityClient.requestPasswordReset({
        email: value.email,
        redirectTo: "/reset-password",
      });
      if (result.error) {
        setError(t("forgotPassword.genericError"));
        return;
      }
      setSuccess(true);
      form.reset();
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        ${backHome}
        <Card>
          <CardHeader className="gap-2">
            <CardTitle as="h1" className="text-2xl tracking-tight">{t("forgotPassword.title")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t("forgotPassword.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>{t("forgotPassword.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {success ? <Alert><AlertTitle>{t("forgotPassword.successTitle")}</AlertTitle><AlertDescription>{t("forgotPassword.successMessage")}</AlertDescription></Alert> : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="email">
                    {(field) => <field.TextField type="email" label={t("forgotPassword.emailLabel")} description={t("forgotPassword.emailDescription")} placeholder={t("forgotPassword.emailPlaceholder")} autoComplete="email" required />}
                  </form.AppField>
                </FieldGroup>
                <form.SubmitButton className="w-full" pendingLabel={t("forgotPassword.submitting")}>{t("forgotPassword.submit")}</form.SubmitButton>
              </Form>
            </form.AppForm>
          </CardContent>
          <CardFooter className="flex-col gap-3"><div className="flex w-full justify-between text-sm">${footer}</div></CardFooter>
        </Card>
      </div>
    </main>
  );
}
`;
}

export function forgotPasswordPage(router: RouterType = "next"): TemplateFile {
  const path =
    router === "tanstack"
      ? "apps/web/src/routes/forgot-password.tsx"
      : "apps/web/src/app/forgot-password/page.tsx";
  return file(path, forgotPasswordPageContent(router));
}
