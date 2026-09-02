import type { RouterType } from "./imports.js";

export function twoFactorPageContent(router: RouterType): string {
  const isTanstack = router === "tanstack";
  const imports = isTanstack
    ? `"use client";
import type * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createTotpSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export const Route = createFileRoute("/2fa")({ component: TwoFactorPage });`
    : `"use client";
import type * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createTotpSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";`;
  const routerHook = isTanstack
    ? "  const navigate = useNavigate();"
    : "  const router = useRouter();";
  const navigate = isTanstack
    ? `      void navigate({ to: "/dashboard" });`
    : `      router.push("/dashboard");`;
  const backHome = isTanstack
    ? `<Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("twoFactor.backHome")}</Link>`
    : `<Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← {t("twoFactor.backHome")}</Link>`;
  const footer = isTanstack
    ? `<Link to="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.backSignIn")}</Link><Link to="/settings" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.recoveryCodes")}</Link>`
    : `<Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.backSignIn")}</Link><Link href="/settings" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("twoFactor.recoveryCodes")}</Link>`;

  return `${imports}

${isTanstack ? "function" : "export default function"} TwoFactorPage(): React.JSX.Element {
${routerHook}
  const t = useSurfaceTranslations("auth");
  const [error, setError] = useState<string | null>(null);
  const form = useAppForm({
    defaultValues: { code: "" },
    validators: { onSubmit: createTotpSchema(t("validation.codeSixDigits")) },
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await identityClient.verifyTwoFactor({ code: value.code, trustDevice: true });
      if (result.error) {
        setError(t("twoFactor.genericError"));
        return;
      }
${navigate}
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        ${backHome}
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center gap-2"><Badge variant="secondary">{t("twoFactor.badge")}</Badge><span className="text-xs text-muted-foreground">{t("twoFactor.securitySummary")}</span></div>
            <CardTitle className="text-2xl tracking-tight">{t("twoFactor.title")}</CardTitle>
            <CardDescription className="max-w-[60ch]">{t("twoFactor.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {error ? <Alert variant="destructive"><AlertTitle>{t("twoFactor.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-6">
                <FieldGroup>
                  <form.AppField name="code">
                    {(field) => <field.OtpField label={t("twoFactor.codeLabel")} description={t("twoFactor.codeDescription")} placeholder={t("twoFactor.codePlaceholder")} required length={6} />}
                  </form.AppField>
                </FieldGroup>
                <form.SubmitButton className="w-full" pendingLabel={t("twoFactor.verifying")}>{t("twoFactor.submit")}</form.SubmitButton>
              </Form>
            </form.AppForm>
          </CardContent>
          <CardFooter className="flex-col gap-3"><div className="flex w-full justify-between text-sm">${footer}</div></CardFooter>
        </Card>
        <p className="mx-auto max-w-[65ch] text-center text-xs text-muted-foreground">{t("twoFactor.securityNote")}</p>
      </div>
    </main>
  );
}
`;
}
