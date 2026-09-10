export function oauthDeletionViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { AccountDeletion } from "../use-account-deletion";
export function DangerZoneView({ model }: { model: AccountDeletion }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { error, pending } = model;
  return <Card className="border-destructive/20 shadow-none"><CardHeader><CardTitle as="h2" className="text-destructive">{t("danger.title")}</CardTitle><CardDescription>{t("danger.oauthDescription")}</CardDescription></CardHeader><CardContent className="flex flex-col items-start gap-4">
    {error ? <Alert variant="destructive"><AlertTitle>{t("danger.errorTitle")}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <Button variant="destructive" disabled={pending} onClick={model.remove}>{pending ? t("danger.deleting") : t("danger.delete")}</Button>
  </CardContent></Card>;
}
`;
}
export function passwordDeletionViewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import type { AccountDeletion } from "../use-account-deletion";
export function DangerZoneView({ model }: { model: AccountDeletion }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const { error, pending, open, form } = model;
  return (
    <Card className="flex flex-col gap-0 border-destructive/20 shadow-none md:flex-row md:items-center md:justify-between">
      <CardHeader><CardTitle as="h2" className="text-destructive">{t("danger.title")}</CardTitle><CardDescription className="max-w-[65ch]">{t("danger.description")}</CardDescription></CardHeader>
      <CardFooter className="shrink-0 pt-0 md:pt-6">
        <Dialog open={open} onOpenChange={model.onOpenChange}>
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
                  <Button type="button" variant="outline" disabled={pending} onClick={model.cancel}>{t("danger.cancel")}</Button>
                  <form.SubmitButton className="w-auto" variant="destructive" disabled={pending} pendingLabel={t("danger.deleting")}>{t("danger.confirm")}</form.SubmitButton>
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
