export function twoFactorViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { TwoFactorSettings } from "../use-two-factor-settings";
export function TwoFactorView({ model }: { model: TwoFactorSettings }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { backupCodes, disableForm, enabled, enableForm, error, totpUri, verifyForm } = model;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle as="h2">{t("twoFactor.title")}</CardTitle>
          <Badge variant={enabled ? "secondary" : "outline"}>
            {enabled ? t("twoFactor.enabled") : t("twoFactor.disabled")}
          </Badge>
        </div>
        <CardDescription className="max-w-[65ch]">{t("twoFactor.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="destructive"><AlertTitle>{t("twoFactor.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {enabled ? (
          <disableForm.AppForm><Form form={disableForm} className="flex flex-col gap-4">
            <p className="max-w-[65ch] text-sm text-muted-foreground">{t("twoFactor.enabledDescription")}</p>
            <FieldGroup><disableForm.AppField name="password">{(field) => <field.PasswordField label={t("twoFactor.passwordLabel")} autoComplete="current-password" required />}</disableForm.AppField></FieldGroup>
            <disableForm.SubmitButton className="w-auto self-start" variant="destructive" pendingLabel={t("twoFactor.disabling")}>{t("twoFactor.disable")}</disableForm.SubmitButton>
          </Form></disableForm.AppForm>
        ) : !totpUri ? (
          <enableForm.AppForm><Form form={enableForm} className="flex flex-col gap-4">
            <p className="max-w-[65ch] text-sm text-muted-foreground">{t("twoFactor.enableDescription")}</p>
            <FieldGroup><enableForm.AppField name="password">{(field) => <field.PasswordField label={t("twoFactor.passwordLabel")} autoComplete="current-password" required />}</enableForm.AppField></FieldGroup>
            <enableForm.SubmitButton className="w-auto self-start" pendingLabel={t("twoFactor.preparing")}>{t("twoFactor.enable")}</enableForm.SubmitButton>
          </Form></enableForm.AppForm>
        ) : (
          <verifyForm.AppForm><Form form={verifyForm} className="flex flex-col gap-4">
            <p className="max-w-[65ch] text-sm text-muted-foreground">{t("twoFactor.scanDescription")}</p>
            <div className="break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">{totpUri}</div>
            {backupCodes ? <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("twoFactor.backupCodesTitle")}</p>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs">{backupCodes.join("\\n")}</pre>
              <p className="max-w-[60ch] text-xs text-muted-foreground">{t("twoFactor.backupCodesDescription")}</p>
            </div> : null}
            <FieldGroup><verifyForm.AppField name="code">{(field) => <field.OtpField label={t("twoFactor.codeLabel")} description={t("twoFactor.codeDescription")} placeholder="000000" required length={6} />}</verifyForm.AppField></FieldGroup>
            <verifyForm.SubmitButton className="w-auto self-start" pendingLabel={t("twoFactor.verifying")}>{t("twoFactor.verify")}</verifyForm.SubmitButton>
          </Form></verifyForm.AppForm>
        )}
      </CardContent>
    </Card>
  );
}
`;
}
