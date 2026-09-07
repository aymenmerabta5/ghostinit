import type { RouterType } from "./imports.js";

/** Route/page orchestrator. The stateful form is emitted as a focused sibling component. */
export function signUpPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const imports = isTanstack
    ? `"use client";
import type * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { ArrowLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute("/sign-up")({ component: SignUpPage });`
    : `"use client";
import type * as React from "react";
import Link from "next/link";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { ArrowLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const backLink = isTanstack
    ? `<Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          <span>{t("signUp.backHome")}</span>
        </Link>`
    : `<Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          <span>{t("signUp.backHome")}</span>
        </Link>`;

  return `${imports}

${isTanstack ? "function" : "export default function"} SignUpPage(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex w-full max-w-[440px] flex-col gap-8">
        ${backLink}
        <SignUpForm />
        <p className="mx-auto max-w-[48ch] text-center text-xs leading-5 text-muted-foreground">{t("signUp.termsPrefix")} {t("signUp.securityNote")}</p>
      </div>
    </main>
  );
}
`;
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
import { useState } from "react";
import { AuthOAuthButtons } from "./oauth-buttons.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { identityClient, type IdentityOAuthProvider } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export function SignUpForm(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);

  async function signUpWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) setError(t("signUp.genericError"));
    } catch {
      setError(t("signUp.genericError"));
    }
  }

  return (
    <Card className="border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6">
        <CardTitle as="h1" className="text-3xl tracking-tight">{t("signUp.title")}</CardTitle>
        <CardDescription className="max-w-[60ch]">{t("signUp.emailDisabled")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
        {error ? <Alert variant="destructive"><AlertTitle>{t("signUp.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <AuthOAuthButtons googleLabel={t("signUp.oauthGoogle")} githubLabel={t("signUp.oauthGitHub")} separatorLabel={t("signUp.or")} onSelect={signUpWithOAuth} />
      </CardContent>
      <CardFooter className="mt-6 justify-center border-t border-border/70 p-0 pt-5 text-sm sm:p-0 sm:pt-5">${signInLink}</CardFooter>
    </Card>
  );
}
`;
  }
  const routerImport = isTanstack
    ? 'import { Link, useNavigate } from "@tanstack/react-router";'
    : `import Link from "next/link";
import { useRouter } from "next/navigation";`;
  const routerHook = isTanstack
    ? "  const navigate = useNavigate();"
    : "  const router = useRouter();";
  const navigate = isTanstack
    ? `      await navigate({ to: destination });`
    : `      router.push(destination);`;
  const signInLink = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("signUp.signInPrompt")} {t("signUp.signInLink")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("signUp.signInPrompt")} {t("signUp.signInLink")}</Link>`;

  return `"use client";

import type * as React from "react";
${routerImport}
import { useState } from "react";
import { AuthOAuthButtons } from "./oauth-buttons.js";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createSignUpSchema, identityClient, type IdentityOAuthProvider } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export function SignUpForm(): React.JSX.Element {
${routerHook}
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const schema = createSignUpSchema({
    invalidEmail: t("validation.invalidEmail"),
    passwordRequired: t("validation.passwordRequired"),
    passwordTooShort: t("validation.passwordTooShort"),
    passwordTooLong: t("validation.passwordTooLong"),
    nameRequired: t("validation.nameRequired"),
    nameTooShort: t("validation.nameTooShort"),
    nameTooLong: t("validation.nameTooLong"),
  });
  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await identityClient.signUpWithEmail({ ...value, callbackURL: "/dashboard" });
      if (result.error) {
        setError(t("signUp.genericError"));
        return;
      }
      const destination = result.data?.token ? "/dashboard" : "/verify-email";
${navigate}
    },
  });

  async function signUpWithOAuth(provider: IdentityOAuthProvider): Promise<void> {
    setError(null);
    try {
      const result = await identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
      if (result.error) setError(t("signUp.genericError"));
    } catch {
      setError(t("signUp.genericError"));
    }
  }

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
          onSelect={signUpWithOAuth}
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
            <form.SubmitButton className="h-10 w-full" pendingLabel={t("signUp.submitting")}>{t("signUp.submit")}</form.SubmitButton>
          </Form>
        </form.AppForm>
      </CardContent>
      <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5"><div className="flex w-full flex-wrap justify-center gap-3 text-sm">${signInLink}</div></CardFooter>
    </Card>
  );
}
`;
}
