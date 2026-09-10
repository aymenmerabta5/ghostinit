import { file, type TemplateFile } from "../../../shared.js";

function managementContent(): string {
  return `"use client";
import { useAppForm } from "@/components/ui/form";
import { toast } from "sonner";
import { z } from "zod";
import { isIdentityRecentAuthenticationError } from "@/lib/auth-model";
import { useSurfaceTranslations } from "@/lib/translations";
import { usePasskeyListQuery } from "./queries";
import { usePasskeyMutation } from "./mutations";
import type { PasskeySummary } from "./model";

export function usePasskeyManagement() {
  const t = useSurfaceTranslations("settings");
  const query = usePasskeyListQuery();
  const mutation = usePasskeyMutation();
  const form = useAppForm({ defaultValues: { name: "" }, onSubmit: async ({ value }) => {
    const result = await mutation.run({ kind: "register", name: value.name.trim() || undefined });
    if (result.status !== "success" || !result.isCurrent()) return;
    form.reset(); toast.success(t("passkeys.registered"));
  } });
  const error = query.error ?? mutation.error;
  return { form, passkeys: query.data ?? [], loading: query.isPending, refreshing: query.isFetching, readSucceeded: query.isSuccess,
    error: error ? (isIdentityRecentAuthenticationError(error.cause) ? t("passkeys.reauthenticate") : t("passkeys.genericError")) : null,
    retry: () => { void query.refetch(); } };
}

export function usePasskeyEditor(passkey: PasskeySummary) {
  const t = useSurfaceTranslations("settings");
  const mutation = usePasskeyMutation();
  const form = useAppForm({ defaultValues: { name: passkey.name ?? t("passkeys.unnamed") },
    validators: { onSubmit: z.object({ name: z.string().trim().min(1, t("passkeys.nameRequired")).max(64) }) },
    onSubmit: async ({ value }) => {
      const result = await mutation.run({ kind: "rename", id: passkey.id, name: value.name.trim() });
      if (result.status === "success" && result.isCurrent()) toast.success(t("passkeys.renamed"));
    } });
  async function remove(): Promise<void> {
    const result = await mutation.run({ kind: "delete", id: passkey.id });
    if (result.status === "success" && result.isCurrent()) toast.success(t("passkeys.deleted"));
  }
  return { form, remove, pending: mutation.isPending,
    error: mutation.error ? (isIdentityRecentAuthenticationError(mutation.error.cause) ? t("passkeys.reauthenticate") : t("passkeys.genericError")) : null };
}
export type PasskeyManagement = ReturnType<typeof usePasskeyManagement>;
export type PasskeyEditor = ReturnType<typeof usePasskeyEditor>;
`;
}

function cardContent(): string {
  return `"use client";
import type * as React from "react";
import { usePasskeyManagement, usePasskeyEditor } from "./use-passkey-management";
import { PasskeyView, PasskeyRowView } from "./components/passkey-view";
import type { PasskeySummary } from "./model";
export function PasskeyCard(): React.JSX.Element {
  const model = usePasskeyManagement();
  return <PasskeyView model={model}>{model.passkeys.map((passkey) => <PasskeyRow key={passkey.id} passkey={passkey} />)}</PasskeyView>;
}
function PasskeyRow({ passkey }: { passkey: PasskeySummary }): React.JSX.Element {
  const model = usePasskeyEditor(passkey);
  return <PasskeyRowView model={model} passkey={passkey} />;
}
`;
}

function viewContent(): string {
  return `"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceLocale, useSurfaceTranslations } from "@/lib/translations";
import type { PasskeyManagement, PasskeyEditor } from "../use-passkey-management";
import type { PasskeySummary } from "../model";

export function PasskeyView({ model, children }: { model: PasskeyManagement; children: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const common = useSurfaceTranslations("common");
  const { form } = model;
  return <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle as="h2">{t("passkeys.title")}</CardTitle>{model.readSucceeded || model.passkeys.length > 0 ? <Badge variant="secondary">{model.passkeys.length}</Badge> : null}</div><CardDescription className="max-w-[65ch]">{t("passkeys.description")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {model.error ? <Alert variant="destructive"><AlertTitle>{t("passkeys.errorTitle")}</AlertTitle><AlertDescription>{model.error}</AlertDescription><Button variant="outline" disabled={model.refreshing} onClick={model.retry}>{common("retry")}</Button></Alert> : null}
    <form.AppForm><Form form={form} className="flex flex-col gap-3"><form.AppField name="name">{(field) => <field.TextField label={t("passkeys.namePlaceholder")} placeholder={t("passkeys.namePlaceholder")} maxLength={64} />}</form.AppField><form.SubmitButton className="w-auto self-start" pendingLabel={t("passkeys.registering")}>{t("passkeys.register")}</form.SubmitButton></Form></form.AppForm>
    {model.loading ? <div role="status" aria-label={common("loading")} aria-busy={true}><Skeleton className="h-24 w-full" /></div> : model.passkeys.length ? <div className="divide-y rounded-lg border">{children}</div> : model.readSucceeded ? <p className="text-sm text-muted-foreground">{t("passkeys.empty")}</p> : null}
  </CardContent></Card>;
}

export function PasskeyRowView({ model, passkey }: { model: PasskeyEditor; passkey: PasskeySummary }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const locale = useSurfaceLocale();
  const { form } = model;
  const deviceLabel = passkey.backedUp ? t("passkeys.backedUp") : passkey.deviceType === "singleDevice" ? t("passkeys.deviceBound") : passkey.deviceType === "multiDevice" ? t("passkeys.backupEligible") : t("passkeys.unknownDevice");
  return <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-center"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{passkey.name ?? t("passkeys.unnamed")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("passkeys.createdAt", { date: new Date(passkey.createdAt).toLocaleDateString(locale) })}</p></div><Badge variant="outline">{deviceLabel}</Badge></div>
    <div className="flex flex-col gap-3"><form.AppForm><Form form={form} className="flex flex-col gap-3"><form.AppField name="name">{(field) => <field.TextField label={t("passkeys.renameLabel")} required maxLength={64} />}</form.AppField><div className="flex flex-wrap gap-2"><form.SubmitButton size="sm" variant="outline" disabled={model.pending}>{t("passkeys.rename")}</form.SubmitButton><Button type="button" size="sm" variant="destructive" disabled={model.pending} onClick={() => void model.remove()}>{t("passkeys.delete")}</Button></div></Form></form.AppForm>
    {model.error ? <Alert variant="destructive"><AlertTitle>{t("passkeys.errorTitle")}</AlertTitle><AlertDescription>{model.error}</AlertDescription></Alert> : null}</div>
  </div>;
}
`;
}

export function settingsPasskeyFeatureFiles(root: string): TemplateFile[] {
  return [
    file(`${root}/use-passkey-management.ts`, managementContent()),
    file(`${root}/passkey-card.tsx`, cardContent()),
    file(`${root}/components/passkey-view.tsx`, viewContent()),
  ];
}
