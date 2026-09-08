import { file, type TemplateFile } from "../../../shared.js";

export function settingsDangerZoneCardContent(hasEmail = true): string {
  if (!hasEmail) {
    return `"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { identityClient, isIdentityRecentAuthenticationError } from "@/lib/auth-client";
import { getQueryClient, transitionQueryAuthScope } from "@/lib/query-client";
import { useSurfaceTranslations } from "@/lib/translations";

export function DangerZoneCard(): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function deleteAccount(): Promise<void> {
    setError(null); setPending(true);
    try {
      const result = await identityClient.deleteAccount();
      if (result.error) { setError(result.error.code === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError") : isIdentityRecentAuthenticationError(result.error) ? t("danger.reauthenticate") : t("danger.genericError")); return; }
      transitionQueryAuthScope(getQueryClient(), null);
      router.push("/");
      router.refresh();
    } catch { setError(t("danger.genericError")); }
    finally { setPending(false); }
  }
  return <Card className="border-destructive/20 shadow-none"><CardHeader><CardTitle as="h2" className="text-destructive">{t("danger.title")}</CardTitle><CardDescription>{t("danger.oauthDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col items-start gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("danger.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Button variant="destructive" disabled={pending} onClick={() => void deleteAccount()}>{pending ? t("danger.deleting") : t("danger.delete")}</Button>
  </CardContent></Card>;
}
`;
  }
  return `"use client";

import type * as React from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Form, useAppForm } from "@/components/ui/form";
import { createRequiredPasswordSchema, identityClient, isIdentityRecentAuthenticationError } from "@/lib/auth-client";
import { getQueryClient, transitionQueryAuthScope } from "@/lib/query-client";
import { useSurfaceTranslations } from "@/lib/translations";

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
      try {
        const result = await identityClient.deleteAccount({ password: value.password });
        if (result.error) { setError(result.error.code === "ACCOUNT_DELETION_RESTRICTED" ? t("danger.retainedRecordError") : isIdentityRecentAuthenticationError(result.error) ? t("danger.reauthenticate") : result.error.code === "INVALID_PASSWORD" ? t("danger.invalidPassword") : t("danger.genericError")); return; }
        transitionQueryAuthScope(getQueryClient(), null);
        setOpen(false);
        router.push("/");
        router.refresh();
      } catch { setError(t("danger.genericError")); }
    },
  });

  return (
    <Card className="flex flex-col gap-0 border-destructive/20 shadow-none md:flex-row md:items-center md:justify-between">
      <CardHeader><CardTitle as="h2" className="text-destructive">{t("danger.title")}</CardTitle><CardDescription className="max-w-[65ch]">{t("danger.description")}</CardDescription></CardHeader>
      <CardFooter className="shrink-0 pt-0 md:pt-6">
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
                  <form.SubmitButton className="w-auto" variant="destructive" pendingLabel={t("danger.deleting")}>{t("danger.confirm")}</form.SubmitButton>
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

export function settingsDangerZoneCard(hasEmail = true): TemplateFile {
  return file(
    "apps/web/src/app/settings/components/danger-zone-card.tsx",
    settingsDangerZoneCardContent(hasEmail),
  );
}
