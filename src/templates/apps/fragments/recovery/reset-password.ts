import { file, type TemplateFile } from "../../../shared.js";

export type RouterType = "next" | "tanstack";

function nextContent(): string {
  return `"use client";
import type * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createResetPasswordSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

function ResetPasswordInner(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const token = searchParams.get("token") ?? "";
  const queryError = searchParams.get("error");
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
      const result = await identityClient.resetPassword({
        newPassword: value.newPassword,
        token,
      });
      if (result.error) {
        setSubmissionError(t("resetPassword.genericError"));
        return;
      }
      router.push("/sign-in?reset=success");
    },
  });

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle as="h1">{t("resetPassword.title")}</CardTitle>
          <CardDescription>{t("resetPassword.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error ? <Alert variant={token ? "destructive" : "default"}><AlertTitle>{token ? t("resetPassword.errorTitle") : t("resetPassword.invalidLinkTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {!token ? (
            <div className="flex flex-col gap-4">
              <p className="max-w-[65ch] text-sm text-muted-foreground">{t("resetPassword.invalidLinkDescription")}</p>
              <Button render={<Link href="/forgot-password" />} nativeButton={false}>{t("resetPassword.requestNewLink")}</Button>
            </div>
          ) : (
            <form.AppForm>
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
            </form.AppForm>
          )}
        </CardContent>
        <CardFooter><Link href="/sign-in" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">{t("resetPassword.backSignIn")}</Link></CardFooter>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage(): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Suspense fallback={<div className="w-full max-w-[420px]"><Card><CardHeader><CardTitle as="h1">{t("resetPassword.title")}</CardTitle><CardDescription>{t("resetPassword.loading")}</CardDescription></CardHeader></Card></div>}>
        <ResetPasswordInner />
      </Suspense>
    </main>
  );
}
`;
}

function tanstackContent(): string {
  return `"use client";
import type * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createResetPasswordSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage(): React.JSX.Element {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const t = useSurfaceTranslations("recovery");
  const authT = useSurfaceTranslations("auth");
  const token = search.token ?? "";
  const linkError = search.error
    ? search.error === "INVALID_TOKEN"
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
      void navigate({ to: "/sign-in" });
    },
  });

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-[420px]">
          <CardHeader><CardTitle as="h1" className="text-2xl tracking-tight">{t("resetPassword.invalidLinkTitle")}</CardTitle><CardDescription className="max-w-[60ch]">{t("resetPassword.invalidLinkDescription")}</CardDescription></CardHeader>
          <CardContent><Button render={<Link to="/forgot-password" />} nativeButton={false}>{t("resetPassword.requestNewLink")}</Button></CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("resetPassword.backHome")}</Link>
        <Card>
          <CardHeader className="gap-2"><CardTitle as="h1" className="text-2xl tracking-tight">{t("resetPassword.title")}</CardTitle><CardDescription className="max-w-[60ch]">{t("resetPassword.description")}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>{t("resetPassword.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="newPassword">{(field) => <field.PasswordField label={t("resetPassword.newPasswordLabel")} description={t("resetPassword.newPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}</form.AppField>
                  <form.AppField name="confirmPassword">{(field) => <field.PasswordField label={t("resetPassword.confirmPasswordLabel")} description={t("resetPassword.confirmPasswordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}</form.AppField>
                </FieldGroup>
                <form.SubmitButton className="w-full" pendingLabel={t("resetPassword.submitting")}>{t("resetPassword.submit")}</form.SubmitButton>
              </Form>
            </form.AppForm>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
`;
}

export function resetPasswordPageContent(router: RouterType = "next"): string {
  return router === "tanstack" ? tanstackContent() : nextContent();
}

export function resetPasswordPage(router: RouterType = "next"): TemplateFile {
  const path =
    router === "tanstack"
      ? "apps/web/src/routes/reset-password.tsx"
      : "apps/web/src/app/reset-password/page.tsx";
  return file(path, resetPasswordPageContent(router));
}
