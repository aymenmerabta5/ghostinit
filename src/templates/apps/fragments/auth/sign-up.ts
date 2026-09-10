import type { RouterType } from "./imports.js";
import { authRouteContent } from "./feature-routes.js";

/** Route/page orchestrator. The stateful form is emitted as a focused sibling component. */
export function signUpPageContent(router: RouterType): string {
  return authRouteContent(router, "sign-up", "SignUpScreen");
}

export function signUpFormContent(router: RouterType, hasEmail = true): string {
  const isTanstack = router === "tanstack";
  if (!hasEmail) {
    const signInImport = isTanstack
      ? 'import { Link } from "@tanstack/react-router";'
      : 'import Link from "next/link";';
    const signInLink = isTanstack
      ? '<Link to="/sign-in" className="text-muted-foreground underline">{t("signUp.signInLink")}</Link>'
      : '<Link href="/sign-in" className="text-muted-foreground underline">{t("signUp.signInLink")}</Link>';
    return `"use client";

import type * as React from "react";
${signInImport}
import { AuthOAuthButtons } from "./oauth-buttons.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SignUpFormState } from "../types";

export function SignUpForm({ state }: { state: SignUpFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { error, methods } = state;
  return (
    <Card className="border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
        <CardTitle as="h1" className="text-3xl tracking-tight">{t("signUp.title")}</CardTitle>
        <CardDescription className="max-w-[60ch]">{t("signUp.emailDisabled")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
        {error ? <Alert variant="destructive"><AlertTitle>{t("signUp.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <AuthOAuthButtons googleLabel={t("signUp.oauthGoogle")} githubLabel={t("signUp.oauthGitHub")} separatorLabel={t("signUp.or")} onSelect={methods.onOAuth} disabled={methods.pending} />
      </CardContent>
      <CardFooter className="mt-6 justify-center border-t border-border/70 p-0 pt-5 text-sm sm:p-0 sm:pt-5">${signInLink}</CardFooter>
    </Card>
  );
}
`;
  }
  const routerImport = isTanstack
    ? 'import { Link } from "@tanstack/react-router";'
    : `import Link from "next/link";`;
  const signInLink = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("signUp.signInPrompt")} {t("signUp.signInLink")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("signUp.signInPrompt")} {t("signUp.signInLink")}</Link>`;

  return `"use client";

import type * as React from "react";
${routerImport}
import { AuthOAuthButtons } from "./oauth-buttons.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { SignUpFormState } from "../types";

export function SignUpForm({ state }: { state: SignUpFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, methods } = state;
  return (
    <Card className="border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
        <CardTitle as="h1" className="text-3xl tracking-tight">{t("signUp.title")}</CardTitle>
        <CardDescription className="max-w-[60ch]">{t("signUp.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
        {error ? <Alert variant="destructive"><AlertTitle>{t("signUp.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <AuthOAuthButtons
          googleLabel={t("signUp.oauthGoogle")}
          githubLabel={t("signUp.oauthGitHub")}
          separatorLabel={t("signUp.or")}
          onSelect={methods.onOAuth} disabled={methods.pending}
        />
        <form.AppForm>
          <Form form={form} className="flex flex-col gap-6">
            <FieldGroup>
              <form.AppField name="name">
                {(field) => <field.TextField label={t("signUp.nameLabel")} description={t("signUp.nameDescription")} placeholder={t("signUp.namePlaceholder")} autoComplete="name" required maxLength={50} />}
              </form.AppField>
              <form.AppField name="email">
                {(field) => <field.TextField type="email" label={t("signUp.emailLabel")} description={t("signUp.emailDescription")} placeholder={t("signUp.emailPlaceholder")} autoComplete="email" required />}
              </form.AppField>
              <form.AppField name="password">
                {(field) => <field.PasswordField label={t("signUp.passwordLabel")} description={t("signUp.passwordDescription")} autoComplete="new-password" required minLength={8} maxLength={64} />}
              </form.AppField>
            </FieldGroup>
            <form.SubmitButton disabled={methods.pending} className="h-10 w-full" pendingLabel={t("signUp.submitting")}>{t("signUp.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
      <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5"><div className="flex w-full flex-wrap justify-center gap-3 text-sm">${signInLink}</div></CardFooter>
    </Card>
  );
}
`;
}
