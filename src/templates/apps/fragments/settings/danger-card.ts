import { file, type TemplateFile } from "../../../shared.js";

export function settingsDangerZoneCardContent(hasEmail = true, useServerActions = false): string {
  const actionImport = useServerActions ? 'import { deleteAccountAction } from "../actions";' : "";
  if (!hasEmail) {
    const authImport = useServerActions
      ? ""
      : 'import { identityClient, isIdentityRecentAuthenticationError } from "@/lib/auth-client";';
    const deleteCall = useServerActions
      ? "const result = await deleteAccountAction({});"
      : "const result = await identityClient.deleteAccount();";
    const errorCheck = useServerActions
      ? 'if (!result.ok) { setError(result.code === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError") : result.code === "SESSION_EXPIRED" || result.code === "SESSION_NOT_FRESH" ? t("danger.reauthenticate") : result.error); return; }'
      : 'if (result.error) { setError(result.error.code === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError") : isIdentityRecentAuthenticationError(result.error) ? t("danger.reauthenticate") : t("danger.genericError")); return; }';
    return `"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
${authImport}
import { useSurfaceTranslations } from "@/lib/translations";
${actionImport}

export function DangerZoneCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function deleteAccount(): Promise<void> {
    setError(null); setPending(true);
    try {
      ${deleteCall}
      ${errorCheck}
      router.push("/");
    } catch { setError(t("danger.genericError")); }
    finally { setPending(false); }
  }
  return <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base text-destructive">{t("danger.title")}</CardTitle><CardDescription>{t("danger.oauthDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("danger.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Button variant="destructive" disabled={pending} onClick={() => void deleteAccount()}>{pending ? t("danger.deleting") : t("danger.delete")}</Button>
  </CardContent></Card>;
}
`;
  }
  const deleteCall = useServerActions
    ? "const result = await deleteAccountAction({ password: value.password });"
    : "const result = await identityClient.deleteAccount({ password: value.password });";
  const errorCheck = useServerActions
    ? 'if (!result.ok) { setError(result.code === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError") : result.error); return; }'
    : 'if (result.error) { setError(result.error.code === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError") : result.error.message ?? t("errors.deleteAccount")); return; }';
  const authImport = useServerActions
    ? 'import { createRequiredPasswordSchema } from "@/lib/auth-client";'
    : 'import { createRequiredPasswordSchema, identityClient } from "@/lib/auth-client";';
  return `"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
${authImport}
import { useSurfaceTranslations } from "@/lib/translations";
${actionImport}

export function DangerZoneCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { password: "" },
    validators: { onSubmit: createRequiredPasswordSchema(t("validation.passwordRequired")) },
    onSubmit: async ({ value }) => {
      setError(null);
      ${deleteCall}
      ${errorCheck}
      setOpen(false);
      router.push("/");
    },
  });

  return (
    <Card className="border-destructive/30">
      <CardHeader><CardTitle className="text-base text-destructive">{t("danger.title")}</CardTitle><CardDescription className="max-w-[65ch]">{t("danger.description")}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        <p className="text-sm text-muted-foreground">{t("danger.passwordDescription")}</p>
      </CardContent>
      <CardFooter>
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) form.reset(); }}>
          <DialogTrigger render={<Button variant="destructive" />}>{t("danger.delete")}</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("danger.dialogTitle")}</DialogTitle><DialogDescription className="max-w-[60ch]">{t("danger.dialogDescription")}</DialogDescription></DialogHeader>
            {error ? <Alert variant="destructive"><AlertTitle>{t("danger.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <form.AppForm>
              <Form form={form} className="flex flex-col gap-4">
                <FieldGroup>
                  <form.AppField name="password">
                    {(field) => <field.PasswordField label={t("danger.passwordLabel")} description={t("danger.passwordDescription")} placeholder={t("danger.passwordPlaceholder")} autoComplete="current-password" required />}
                  </form.AppField>
                </FieldGroup>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("danger.cancel")}</Button>
                  <form.SubmitButton variant="destructive" pendingLabel={t("danger.deleting")}>{t("danger.confirm")}</form.SubmitButton>
                </DialogFooter>
              </Form>
            </form.AppForm>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}
`;
}

export function settingsDangerZoneCard(hasEmail = true, useServerActions = false): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/danger-zone-card.tsx",
    settingsDangerZoneCardContent(hasEmail, useServerActions),
  );
}
