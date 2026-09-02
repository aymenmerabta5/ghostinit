import { file, type TemplateFile } from "../../../shared.js";

type RouterType = "next" | "tanstack";

function emailFlowPageContent(kind: "magic-link" | "verify-email", router: RouterType): string {
  const linkImport =
    router === "tanstack"
      ? 'import { createFileRoute, Link } from "@tanstack/react-router";'
      : 'import Link from "next/link";';
  const route =
    router === "tanstack"
      ? `export const Route = createFileRoute("/${kind}")({ component: EmailFlowPage });\n\n`
      : "";
  const componentExport = router === "next" ? "export default " : "";
  const homeLink =
    router === "tanstack"
      ? '<Link to="/sign-in">{t("emailFlow.backSignIn")}</Link>'
      : '<Link href="/sign-in">{t("emailFlow.backSignIn")}</Link>';
  const catalogKey = kind === "magic-link" ? "magicLink" : "verifyEmail";
  const operation =
    kind === "magic-link"
      ? 'identityClient.requestMagicLink({ email: value.email, callbackURL: "/dashboard" })'
      : 'identityClient.requestEmailVerification({ email: value.email, callbackURL: "/dashboard" })';
  const successKey = kind === "magic-link" ? "magicLinkSuccess" : "verifyEmailSuccess";
  return `"use client";
import * as React from "react";
${linkImport}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createEmailSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

${route}${componentExport}function EmailFlowPage(): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onSubmit: createEmailSchema(t("validation.invalidEmail")) },
    onSubmit: async ({ value }) => {
      setError(null); setSent(false);
      const result = await ${operation};
      if (result.error) { setError(t("emailFlow.sendError")); return; }
      setSent(true);
    },
  });
  return <main className="grid min-h-screen place-items-center bg-background p-6"><Card className="w-full max-w-md"><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("emailFlow.kicker")}</p><CardTitle>{t("emailFlow.${catalogKey}.title")}</CardTitle><CardDescription>{t("emailFlow.${catalogKey}.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("emailFlow.requestErrorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {sent ? <Alert><AlertTitle>{t("emailFlow.requestedTitle")}</AlertTitle><AlertDescription>{t("emailFlow.${successKey}")}</AlertDescription></Alert> : null}
    <form.AppForm><Form form={form} className="flex flex-col gap-4"><FieldGroup><form.AppField name="email">{(field) => <field.TextField label={t("emailFlow.emailLabel")} placeholder={t("emailFlow.emailPlaceholder")} type="email" autoComplete="email" required />}</form.AppField></FieldGroup><form.SubmitButton pendingLabel={t("emailFlow.sending")}>{t("emailFlow.sendLink")}</form.SubmitButton></Form></form.AppForm>
    <div className="text-sm text-muted-foreground underline underline-offset-4">${homeLink}</div>
  </CardContent></Card></main>;
}
`;
}

export function emailFlowFiles(router: RouterType = "next"): TemplateFile[] {
  const base = router === "tanstack" ? "apps/web/src/routes" : "apps/web/src/app";
  return [
    file(
      router === "tanstack" ? `${base}/magic-link.tsx` : `${base}/magic-link/page.tsx`,
      emailFlowPageContent("magic-link", router),
    ),
    file(
      router === "tanstack" ? `${base}/verify-email.tsx` : `${base}/verify-email/page.tsx`,
      emailFlowPageContent("verify-email", router),
    ),
  ];
}

export { emailFlowPageContent };
