import { file, type TemplateFile } from "../../../shared.js";
import { authRouteContent } from "../auth/feature-routes.js";

export type RouterType = "next" | "tanstack";

export function forgotPasswordViewContent(router: RouterType = "next"): string {
  const isTanstack = router === "tanstack";
  const imports = isTanstack
    ? `"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { ForgotPasswordFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";

`
    : `"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { ForgotPasswordFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const backHome = isTanstack
    ? `<Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />{t("forgotPassword.backHome")}</Link>`
    : `<Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />{t("forgotPassword.backHome")}</Link>`;
  const footer = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.backSignIn")}</Link><Link to="/sign-up" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.createAccount")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.backSignIn")}</Link><Link href="/sign-up" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("forgotPassword.createAccount")}</Link>`;

  return `${imports}

export function ForgotPasswordView({ state }: { state: ForgotPasswordFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  const { form, error, success } = state;
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        ${backHome}
        <Card className="border-0 bg-transparent p-0 shadow-none">
          <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
            <CardTitle as="h1" className="text-3xl tracking-tight">{t("forgotPassword.title")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t("forgotPassword.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
            {error ? <Alert variant="destructive"><AlertTitle>{t("forgotPassword.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            {success ? <Alert><AlertTitle>{t("forgotPassword.successTitle")}</AlertTitle><AlertDescription>{t("forgotPassword.successMessage")}</AlertDescription></Alert> : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="email">
                    {(field) => <field.TextField type="email" label={t("forgotPassword.emailLabel")} description={t("forgotPassword.emailDescription")} placeholder={t("forgotPassword.emailPlaceholder")} autoComplete="email" required />}
                  </form.AppField>
                </FieldGroup>
                <form.SubmitButton className="h-10 w-full" pendingLabel={t("forgotPassword.submitting")}>{t("forgotPassword.submit")}</form.SubmitButton>
              </Form>
            </form.AppForm>
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5"><div className="flex w-full flex-wrap justify-between gap-3 text-sm">${footer}</div></CardFooter>
        </Card>
      </div>
    </main>
  );
}
`;
}

export function forgotPasswordPageContent(router: RouterType = "next"): string {
  return authRouteContent(router, "forgot-password", "ForgotPasswordScreen");
}

export function forgotPasswordPage(router: RouterType = "next"): TemplateFile {
  const path =
    router === "tanstack"
      ? "apps/web/src/routes/forgot-password.tsx"
      : "apps/web/src/app/forgot-password/page.tsx";
  return file(path, forgotPasswordPageContent(router));
}
