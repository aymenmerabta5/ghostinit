import type { RouterType } from "./imports.js";
import { authRouteContent } from "./feature-routes.js";

export function twoFactorPageContent(router: RouterType): string {
  return authRouteContent(router, "2fa", "TwoFactorScreen");
}

export function twoFactorFormContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const routerImport = isTanstack
    ? `import { Link } from "@tanstack/react-router";`
    : `import Link from "next/link";`;
  const imports = `"use client";
import type * as React from "react";
${routerImport}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { TwoFactorFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const footer = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.backSignIn")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.backSignIn")}</Link>`;

  return `${imports}

export function TwoFactorForm({ state }: { state: TwoFactorFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, useBackupCode, toggleMethod } = state;
  return (
        <Card className="border-0 bg-transparent p-0 shadow-none">
          <CardHeader className="gap-3 p-0 pb-6 sm:p-0 sm:pb-6">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{t("twoFactor.badge")}</Badge><span className="text-xs leading-5 text-muted-foreground">{t("twoFactor.securitySummary")}</span></div>
            <CardTitle as="h1" className="text-3xl tracking-tight">{t("twoFactor.title")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t(useBackupCode ? "twoFactor.backupCodeDescription" : "twoFactor.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-0 sm:p-0">
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
                <form.SubmitButton className="h-10 w-full" pendingLabel={t("twoFactor.verifying")}>{t("twoFactor.submit")}</form.SubmitButton>
              </Form>
            </form.AppForm>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => <Button className="w-auto self-start" variant="ghost" disabled={isSubmitting} onClick={toggleMethod}>{t(useBackupCode ? "twoFactor.useAuthenticatorCode" : "twoFactor.useBackupCode")}</Button>}
            </form.Subscribe>
          </CardContent>
          <CardFooter className="mt-6 flex-col gap-3 border-t border-border/70 p-0 pt-5 sm:p-0 sm:pt-5"><div className="flex w-full flex-wrap justify-between gap-3 text-sm">${footer}</div></CardFooter>
        </Card>
  );
}
`;
}
