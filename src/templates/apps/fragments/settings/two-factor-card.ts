import { file, type TemplateFile } from "../../../shared.js";

export function settingsTwoFactorHookContent(): string {
  return `"use client";
import { useState } from "react";
import { useAppForm } from "@/components/ui/form";
import { createRequiredPasswordSchema, createTotpSchema, identityClient } from "@/lib/auth-client";
import { useSurfaceTranslations } from "@/lib/translations";

export function useTwoFactorSettings() {
  const t = useSurfaceTranslations("settings");
  const { data: session } = identityClient.useSession();
  const serverEnabled = session?.user
    ? Reflect.get(session.user, "twoFactorEnabled") === true
    : false;
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<{
    serverValue: boolean;
    value: boolean;
  } | null>(null);
  const enabled = optimistic?.serverValue === serverEnabled ? optimistic.value : serverEnabled;
  const passwordSchema = createRequiredPasswordSchema(t("validation.passwordRequired"));
  const enableForm = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await identityClient.enableTwoFactor({ password: value.password });
      if (result.error || !result.data) {
        setError(result.error?.message ?? t("errors.twoFactorEnable"));
        return;
      }
      setTotpUri(result.data.totpURI);
      setBackupCodes(result.data.backupCodes);
    },
  });
  const verifyForm = useAppForm({
    defaultValues: { code: "" },
    validators: { onSubmit: createTotpSchema(t("validation.codeSixDigits")) },
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await identityClient.verifyTwoFactor({ code: value.code, trustDevice: false });
      if (result.error) {
        setError(result.error.message ?? t("errors.invalidCode"));
        return;
      }
      setOptimistic({ serverValue: serverEnabled, value: true });
      setTotpUri(null);
      setBackupCodes(null);
      verifyForm.reset();
      enableForm.reset();
    },
  });
  const disableForm = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: passwordSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const result = await identityClient.disableTwoFactor({ password: value.password });
      if (result.error) {
        setError(result.error.message ?? t("errors.twoFactorDisable"));
        return;
      }
      setOptimistic({ serverValue: serverEnabled, value: false });
      disableForm.reset();
    },
  });
  return { backupCodes, disableForm, enabled, enableForm, error, totpUri, verifyForm };
}
`;
}

export function settingsTwoFactorCardContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { useTwoFactorSettings } from "./use-two-factor-settings";

export function TwoFactorCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { backupCodes, disableForm, enabled, enableForm, error, totpUri, verifyForm } =
    useTwoFactorSettings();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{t("twoFactor.title")}</CardTitle>
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
            <disableForm.SubmitButton variant="outline" pendingLabel={t("twoFactor.disabling")}>{t("twoFactor.disable")}</disableForm.SubmitButton>
          </Form></disableForm.AppForm>
        ) : !totpUri ? (
          <enableForm.AppForm><Form form={enableForm} className="flex flex-col gap-4">
            <p className="max-w-[65ch] text-sm text-muted-foreground">{t("twoFactor.enableDescription")}</p>
            <FieldGroup><enableForm.AppField name="password">{(field) => <field.PasswordField label={t("twoFactor.passwordLabel")} autoComplete="current-password" required />}</enableForm.AppField></FieldGroup>
            <enableForm.SubmitButton pendingLabel={t("twoFactor.preparing")}>{t("twoFactor.enable")}</enableForm.SubmitButton>
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
            <verifyForm.SubmitButton pendingLabel={t("twoFactor.verifying")}>{t("twoFactor.verify")}</verifyForm.SubmitButton>
          </Form></verifyForm.AppForm>
        )}
      </CardContent>
    </Card>
  );
}
`;
}

export function settingsTwoFactorCard(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/two-factor-card.tsx",
    settingsTwoFactorCardContent(),
  );
}

export function settingsTwoFactorHook(): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/use-two-factor-settings.ts",
    settingsTwoFactorHookContent(),
  );
}
