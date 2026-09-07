import type { RouterType } from "./imports.js";

export function twoFactorPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const imports = isTanstack
    ? `"use client";
import type * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute("/2fa")({ component: TwoFactorPage });`
    : `"use client";
import type * as React from "react";
import Link from "next/link";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const backHome = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("twoFactor.backHome")}</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("twoFactor.backHome")}</Link>`;

  return `${imports}

${isTanstack ? "function" : "export default function"} TwoFactorPage(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        ${backHome}
        <TwoFactorForm />
        <p className="mx-auto max-w-[65ch] text-center text-xs text-muted-foreground">{t("twoFactor.securityNote")}</p>
      </div>
    </main>
  );
}
`;
}

export function twoFactorFormContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const routerImport = isTanstack
    ? `import { Link, useNavigate } from "@tanstack/react-router";`
    : `import Link from "next/link";
import { useRouter } from "next/navigation";`;
  const imports = `"use client";
import type * as React from "react";
${routerImport}
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createTwoFactorChallengeSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const routerHook = isTanstack
    ? "  const navigate = useNavigate();"
    : "  const router = useRouter();";
  const navigate = isTanstack
    ? `      void navigate({ to: "/dashboard" });`
    : `      router.push("/dashboard");`;
  const footer = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.backSignIn")}</Link><Link to="/settings" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.recoveryCodes")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.backSignIn")}</Link><Link href="/settings" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.recoveryCodes")}</Link>`;

  return `${imports}

export function TwoFactorForm(): React.JSX.Element {
${routerHook}
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const form = useAppForm({
    defaultValues: { code: "", trustDevice: false },
    validators: { onSubmit: createTwoFactorChallengeSchema(
      useBackupCode ? "backup" : "authenticator",
      t(useBackupCode ? "twoFactor.backupCodeDescription" : "validation.codeSixDigits"),
    ) },
    onSubmit: async ({ value }) => {
      setError(null);
      const input = { code: value.code.trim(), trustDevice: value.trustDevice };
      const result = useBackupCode
        ? await identityClient.verifyBackupCode(input)
        : await identityClient.verifyTwoFactor(input);
      if (result.error) {
        setError(t("twoFactor.genericError"));
        return;
      }
${navigate}
    },
  });

  return (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center gap-2"><Badge variant="secondary">{t("twoFactor.badge")}</Badge><span className="text-xs text-muted-foreground">{t("twoFactor.securitySummary")}</span></div>
            <CardTitle as="h1" className="text-2xl tracking-tight">{t("twoFactor.title")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t(useBackupCode ? "twoFactor.backupCodeDescription" : "twoFactor.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>{t("twoFactor.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="code">
                    {(field) => useBackupCode
                      ? <field.TextField label={t("twoFactor.backupCodeLabel")} description={t("twoFactor.backupCodeDescription")} autoComplete="one-time-code" required />
                      : <field.OtpField label={t("twoFactor.codeLabel")} description={t("twoFactor.codeDescription")} placeholder={t("twoFactor.codePlaceholder")} required length={6} />}
                  </form.AppField>
                  <form.AppField name="trustDevice">
                    {(field) => <field.CheckboxField label={t("twoFactor.trustDeviceLabel")} description={t("twoFactor.trustDeviceDescription")} />}
                  </form.AppField>
                </FieldGroup>
                <form.SubmitButton className="w-full" pendingLabel={t("twoFactor.verifying")}>{t("twoFactor.submit")}</form.SubmitButton>
              </Form>
            </form.AppForm>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => <Button variant="ghost" disabled={isSubmitting} onClick={() => {
                setUseBackupCode((current) => !current);
                setError(null);
                form.reset();
              }}>{t(useBackupCode ? "twoFactor.useAuthenticatorCode" : "twoFactor.useBackupCode")}</Button>}
            </form.Subscribe>
          </CardContent>
          <CardFooter className="flex-col gap-3"><div className="flex w-full justify-between text-sm">${footer}</div></CardFooter>
        </Card>
  );
}
`;
}
