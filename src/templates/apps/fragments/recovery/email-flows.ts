import { file, type TemplateFile } from "../../../shared.js";
import { authRouteContent } from "../auth/feature-routes.js";

type RouterType = "next" | "tanstack";

export function emailFlowViewContent(
  kind: "magic-link" | "verify-email",
  router: RouterType,
): string {
  const linkImport =
    router === "tanstack"
      ? 'import { Link } from "@tanstack/react-router";'
      : 'import Link from "next/link";';
  const homeLink =
    router === "tanstack"
      ? '<Link to="/sign-in">{t("emailFlow.backSignIn")}</Link>'
      : '<Link href="/sign-in">{t("emailFlow.backSignIn")}</Link>';
  const catalogKey = kind === "magic-link" ? "magicLink" : "verifyEmail";
  const successKey = kind === "magic-link" ? "magicLinkSuccess" : "verifyEmailSuccess";
  return `"use client";
import * as React from "react";
${linkImport}
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import type { EmailFlowFormState } from "../types";
import { useSurfaceTranslations } from "@/lib/translations";

export function EmailFlowView({ state }: { state: EmailFlowFormState }): React.JSX.Element {
  const t = useSurfaceTranslations("auth");
  const { form, error, sent } = state;
  return <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14"><Card className="w-full max-w-[440px] border-0 bg-transparent p-0 shadow-none"><CardHeader className="gap-2 p-0 pb-6 sm:p-0 sm:pb-6"><p className="text-sm font-medium text-muted-foreground">{t("emailFlow.kicker")}</p><CardTitle as="h1" className="text-3xl tracking-tight">{t("emailFlow.${catalogKey}.title")}</CardTitle><CardDescription>{t("emailFlow.${catalogKey}.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-6 p-0 sm:p-0">
    {error ? <Alert variant="destructive"><AlertTitle>{t("emailFlow.requestErrorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {sent ? <Alert><AlertTitle>{t("emailFlow.requestedTitle")}</AlertTitle><AlertDescription>{t("emailFlow.${successKey}")}</AlertDescription></Alert> : null}
    <form.AppForm><Form form={form} className="flex flex-col gap-5"><FieldGroup><form.AppField name="email">{(field) => <field.TextField label={t("emailFlow.emailLabel")} placeholder={t("emailFlow.emailPlaceholder")} type="email" autoComplete="email" required />}</form.AppField></FieldGroup><form.SubmitButton className="h-10 w-full" pendingLabel={t("emailFlow.sending")}>{t("emailFlow.sendLink")}</form.SubmitButton></Form></form.AppForm>
    <div className="border-t border-border/70 pt-5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">${homeLink}</div>
  </CardContent></Card></main>;
}
`;
}

export function emailFlowPageContent(
  kind: "magic-link" | "verify-email",
  router: RouterType,
): string {
  return authRouteContent(
    router,
    kind,
    kind === "magic-link" ? "MagicLinkScreen" : "VerifyEmailScreen",
  );
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
